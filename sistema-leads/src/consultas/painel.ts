import { sql, type SQL } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { aguardandoRespostaPorPessoa } from "./kanban";

// Consultas do Painel (gestão). Cada bloco é UMA consulta agregada (sem N+1), em SQL com CTEs
// e window functions. Pessoas mescladas nunca entram.
//
// "Leads do período": pessoas não mescladas com `primeiro_contato_em` no período [de, ate).
// Cidade do lead: a do PRIMEIRO formulário enviado que tinha cidade (LP grava em `dados.cidade`,
// Meta em `dados.campos.cidade`); sem formulário com cidade, a cidade da origem do primeiro toque.
// Os filtros opcionais de cidade (igual, sem diferenciar maiúsculas) e origem (do primeiro toque)
// valem para todos os blocos.

export type FiltrosPainel = {
  /** Início do período (inclusive). */
  de: Date;
  /** Fim do período (exclusivo). */
  ate: Date;
  cidade?: string | null;
  origemId?: string | null;
};

const FUSO = "America/Sao_Paulo";

function ts(data: Date): SQL {
  return sql`${data.toISOString()}::timestamptz`;
}

async function linhas<T>(executor: Executor, consulta: SQL): Promise<T[]> {
  const resultado = (await executor.execute(consulta)) as unknown as { rows: T[] };
  return resultado.rows;
}

const CIDADE_FORM = sql.raw(
  `coalesce(nullif(trim(e.dados->>'cidade'), ''), nullif(trim(e.dados->'campos'->>'cidade'), ''))`,
);

/**
 * CTE `leads` (id, estagio_id, origem_id, primeiro_contato_em, cidade) com os filtros de cidade
 * e origem. Com `comPeriodo`, só os leads cujo primeiro contato caiu no período.
 */
function cteLeads(f: FiltrosPainel, opcoes: { comPeriodo: boolean } = { comPeriodo: true }): SQL {
  const condicoes: SQL[] = [sql`p.mesclada_para_id is null`];
  if (opcoes.comPeriodo) {
    condicoes.push(sql`p.primeiro_contato_em >= ${ts(f.de)}`, sql`p.primeiro_contato_em < ${ts(f.ate)}`);
  }
  if (f.origemId) condicoes.push(sql`p.origem_primeiro_toque_id = ${f.origemId}::uuid`);
  const cidade = f.cidade?.trim();
  const filtroCidade = cidade ? sql`where lower(cidade) = lower(${cidade})` : sql``;
  return sql`leads_base as (
    select p.id, p.estagio_id, p.origem_primeiro_toque_id as origem_id, p.primeiro_contato_em,
      coalesce(
        (select ${CIDADE_FORM} from eventos e
          where e.pessoa_id = p.id and e.tipo = 'form_enviado' and ${CIDADE_FORM} is not null
          order by e.ocorrido_em asc, e.registrado_em asc limit 1),
        nullif(trim(o.cidade), '')
      ) as cidade
    from pessoas p
    left join origens o on o.id = p.origem_primeiro_toque_id
    where ${sql.join(condicoes, sql` and `)}
  ),
  leads as (select * from leads_base ${filtroCidade})`;
}

// 1. Leads por origem ------------------------------------------------------------------------

export type LinhaOrigem = { origemId: string | null; nome: string; total: number };

/** Leads do período por origem do primeiro toque, do maior para o menor. */
export async function leadsPorOrigem(f: FiltrosPainel, executor: Executor = db): Promise<LinhaOrigem[]> {
  const r = await linhas<{ origem_id: string | null; nome: string | null; total: number }>(
    executor,
    sql`with ${cteLeads(f)}
      select l.origem_id, o.nome, count(*)::int as total
      from leads l left join origens o on o.id = l.origem_id
      group by l.origem_id, o.nome
      order by total desc, o.nome asc nulls last`,
  );
  return r.map((l) => ({ origemId: l.origem_id, nome: l.nome ?? "Sem origem", total: Number(l.total) }));
}

// 2. Leads por cidade ------------------------------------------------------------------------

export type LinhaCidade = { cidade: string | null; total: number };

/** Leads do período por cidade (sem cidade conhecida fica como null), do maior para o menor. */
export async function leadsPorCidade(f: FiltrosPainel, executor: Executor = db): Promise<LinhaCidade[]> {
  const r = await linhas<{ cidade: string | null; total: number }>(
    executor,
    sql`with ${cteLeads(f)}
      select cidade, count(*)::int as total
      from leads group by cidade
      order by total desc, cidade asc nulls last`,
  );
  return r.map((l) => ({ cidade: l.cidade, total: Number(l.total) }));
}

// 3. Leads por dia ---------------------------------------------------------------------------

export type LinhaDia = { dia: string; total: number };

/** Série diária (horário de Brasília) do período, com zero nos dias sem lead. */
export async function leadsPorDia(f: FiltrosPainel, executor: Executor = db): Promise<LinhaDia[]> {
  const r = await linhas<{ dia: string; total: number }>(
    executor,
    sql`with ${cteLeads(f)},
      por_dia as (
        select (primeiro_contato_em at time zone ${FUSO})::date as dia, count(*)::int as total
        from leads group by 1
      )
      select to_char(d::date, 'YYYY-MM-DD') as dia, coalesce(pd.total, 0)::int as total
      from generate_series(
        (${ts(f.de)} at time zone ${FUSO})::date,
        ((${ts(f.ate)} - interval '1 millisecond') at time zone ${FUSO})::date,
        interval '1 day'
      ) as d
      left join por_dia pd on pd.dia = d::date
      order by d`,
  );
  return r.map((l) => ({ dia: l.dia, total: Number(l.total) }));
}

// 4. Primeiro x último toque -----------------------------------------------------------------

export type LinhaToques = { origemId: string; nome: string; primeiro: number; ultimo: number };

/**
 * Para os leads do período: quantas pessoas têm cada origem como 1º toque e como último toque.
 * Mesma regra de src/consultas/toques.ts, para o conjunto: primeiro toque = evento com origem
 * mais antigo; último toque = o mais recente ANTES da primeira `venda_registrada` (sem venda, o
 * último de todos). Desempate por `registrado_em` e `id`.
 */
export async function primeiroEUltimoToquePorOrigem(
  f: FiltrosPainel,
  executor: Executor = db,
): Promise<LinhaToques[]> {
  const r = await linhas<{ origem_id: string; nome: string; primeiro: number; ultimo: number }>(
    executor,
    sql`with ${cteLeads(f)},
      ev as (
        select e.id, e.pessoa_id, e.origem_id, e.ocorrido_em, e.registrado_em,
          min(e.ocorrido_em) filter (where e.tipo = 'venda_registrada')
            over (partition by e.pessoa_id) as primeira_venda
        from eventos e
        join leads l on l.id = e.pessoa_id
        where e.origem_id is not null or e.tipo = 'venda_registrada'
      ),
      toques as (
        select pessoa_id, origem_id,
          (primeira_venda is null or ocorrido_em < primeira_venda) as antes_da_venda,
          row_number() over (partition by pessoa_id
            order by ocorrido_em asc, registrado_em asc, id asc) as n_primeiro,
          row_number() over (partition by pessoa_id, (primeira_venda is null or ocorrido_em < primeira_venda)
            order by ocorrido_em desc, registrado_em desc, id desc) as n_ultimo
        from ev where origem_id is not null
      )
      select o.id as origem_id, o.nome,
        (count(*) filter (where t.n_primeiro = 1))::int as primeiro,
        (count(*) filter (where t.antes_da_venda and t.n_ultimo = 1))::int as ultimo
      from toques t join origens o on o.id = t.origem_id
      group by o.id, o.nome
      having count(*) filter (where t.n_primeiro = 1) > 0
        or count(*) filter (where t.antes_da_venda and t.n_ultimo = 1) > 0
      order by primeiro desc, ultimo desc, o.nome asc`,
  );
  return r.map((l) => ({
    origemId: l.origem_id,
    nome: l.nome,
    primeiro: Number(l.primeiro),
    ultimo: Number(l.ultimo),
  }));
}

// 5. Conversão por estágio -------------------------------------------------------------------

export type LinhaEstagio = {
  estagioId: string;
  nome: string;
  ordem: number;
  tipo: "aberto" | "ganho" | "perdido";
  /** Pessoas que estão neste estágio hoje (sem estágio conta como o primeiro). */
  hoje: number;
  /** Pessoas que passaram por este estágio (evento `estagio_alterado` para ele, ou estão nele). */
  passaram: number;
  /** `passaram` em relação ao total de leads do período (0 a 1). */
  percentual: number;
};

export type ConversaoEstagios = { totalLeads: number; estagios: LinhaEstagio[] };

/**
 * Funil dos leads do período. O primeiro estágio conta todos os leads como "passaram": a entrada
 * no funil não grava evento (ver `definirEstagioInicialSeVazio`).
 */
export async function conversaoPorEstagio(
  f: FiltrosPainel,
  executor: Executor = db,
): Promise<ConversaoEstagios> {
  const r = await linhas<{
    id: string;
    nome: string;
    ordem: number;
    tipo: LinhaEstagio["tipo"];
    hoje: number;
    passaram: number;
    total_leads: number;
  }>(
    executor,
    sql`with ${cteLeads(f)},
      inicial as (select id from estagios order by ordem asc, nome asc limit 1),
      atual as (
        select l.id as pessoa_id, coalesce(l.estagio_id, (select id from inicial)) as estagio_id from leads l
      ),
      passagens as (
        select pessoa_id, estagio_id from atual
        union
        select e.pessoa_id, s.id
        from eventos e
        join leads l on l.id = e.pessoa_id
        join estagios s on s.id::text = e.dados->>'para'
        where e.tipo = 'estagio_alterado'
      ),
      hoje as (select estagio_id, count(*)::int as n from atual group by estagio_id),
      passaram as (select estagio_id, count(*)::int as n from passagens group by estagio_id)
      select s.id, s.nome, s.ordem, s.tipo,
        coalesce(h.n, 0)::int as hoje,
        case when s.id = (select id from inicial) then (select count(*) from leads)
          else coalesce(pa.n, 0) end::int as passaram,
        (select count(*) from leads)::int as total_leads
      from estagios s
      left join hoje h on h.estagio_id = s.id
      left join passaram pa on pa.estagio_id = s.id
      order by s.ordem asc, s.nome asc`,
  );
  const totalLeads = r.length > 0 ? Number(r[0].total_leads) : 0;
  return {
    totalLeads,
    estagios: r.map((l) => ({
      estagioId: l.id,
      nome: l.nome,
      ordem: Number(l.ordem),
      tipo: l.tipo,
      hoje: Number(l.hoje),
      passaram: Number(l.passaram),
      percentual: totalLeads > 0 ? Number(l.passaram) / totalLeads : 0,
    })),
  };
}

// 6. Tempo de primeira resposta por número ---------------------------------------------------

export type LinhaPrimeiraResposta = {
  numeroMonitorado: string;
  apelido: string | null;
  /** Chats cuja primeira mensagem recebida caiu no período. */
  chats: number;
  respondidos: number;
  semResposta: number;
  mediaMs: number | null;
  medianaMs: number | null;
};

function temFiltroDePessoa(f: FiltrosPainel): boolean {
  return Boolean(f.origemId || f.cidade?.trim());
}

/**
 * Para cada chat (número monitorado + chat), a diferença entre a primeira mensagem recebida
 * (`in`) e a primeira enviada (`out`) depois dela. Entram os chats cuja primeira recebida caiu no
 * período; com filtro de cidade ou origem, só os chats das pessoas que passam no filtro.
 * Média e mediana por número, mais os chats ainda sem resposta.
 */
export async function primeiraRespostaPorNumero(
  f: FiltrosPainel,
  executor: Executor = db,
): Promise<LinhaPrimeiraResposta[]> {
  const filtro = temFiltroDePessoa(f);
  const r = await linhas<{
    numero_monitorado: string;
    apelido: string | null;
    chats: number;
    respondidos: number;
    media_s: string | number | null;
    mediana_s: string | number | null;
  }>(
    executor,
    sql`with ${cteLeads(f, { comPeriodo: false })},
      marcadas as (
        select m.numero_monitorado, m.chat_id, m.direcao, m.enviada_em,
          min(m.enviada_em) filter (where m.direcao = 'in')
            over (partition by m.numero_monitorado, m.chat_id) as primeira_in
        from mensagens m
        ${filtro ? sql`where m.pessoa_id in (select id from leads)` : sql``}
      ),
      chats as (
        select numero_monitorado, chat_id, primeira_in,
          min(enviada_em) filter (where direcao = 'out' and enviada_em >= primeira_in) as primeira_out
        from marcadas
        where primeira_in is not null
        group by numero_monitorado, chat_id, primeira_in
      )
      select c.numero_monitorado, n.apelido,
        count(*)::int as chats,
        count(c.primeira_out)::int as respondidos,
        avg(extract(epoch from (c.primeira_out - c.primeira_in))) as media_s,
        percentile_cont(0.5) within group (order by extract(epoch from (c.primeira_out - c.primeira_in))) as mediana_s
      from chats c
      left join numeros n on n.numero = c.numero_monitorado
      where c.primeira_in >= ${ts(f.de)} and c.primeira_in < ${ts(f.ate)}
      group by c.numero_monitorado, n.apelido
      order by chats desc, c.numero_monitorado asc`,
  );
  const ms = (v: string | number | null) => (v === null ? null : Math.round(Number(v) * 1000));
  return r.map((l) => ({
    numeroMonitorado: l.numero_monitorado,
    apelido: l.apelido,
    chats: Number(l.chats),
    respondidos: Number(l.respondidos),
    semResposta: Number(l.chats) - Number(l.respondidos),
    mediaMs: ms(l.media_s),
    medianaMs: ms(l.mediana_s),
  }));
}

// 7. Leads sem resposta ----------------------------------------------------------------------

export const LIMITE_SEM_RESPOSTA = 50;

export type LeadSemResposta = {
  pessoaId: string;
  nome: string | null;
  telefone: string | null;
  estagioNome: string | null;
  aguardandoDesde: Date;
};

/**
 * Pessoas (não mescladas) com mensagem recebida sem nenhuma enviada depois, no estado de AGORA
 * (não depende do período; os filtros de cidade e origem valem). Ordem: quem espera há mais
 * tempo primeiro. Até `LIMITE_SEM_RESPOSTA`. Três consultas: candidatos (chats cuja última
 * mensagem é recebida), `aguardandoRespostaPorPessoa` e os dados das escolhidas.
 */
export async function leadsSemResposta(
  f: FiltrosPainel,
  executor: Executor = db,
): Promise<LeadSemResposta[]> {
  const candidatos = await linhas<{ pessoa_id: string }>(
    executor,
    sql`with ${cteLeads(f, { comPeriodo: false })},
      ultimas as (
        select m.pessoa_id, m.direcao,
          row_number() over (partition by m.numero_monitorado, m.chat_id
            order by m.enviada_em desc, m.direcao asc) as n
        from mensagens m
        where m.pessoa_id in (select id from leads)
      )
      select distinct pessoa_id from ultimas where n = 1 and direcao = 'in'`,
  );
  if (candidatos.length === 0) return [];

  const aguardando = await aguardandoRespostaPorPessoa(
    candidatos.map((c) => c.pessoa_id),
    executor,
  );
  const escolhidas = [...aguardando.entries()]
    .sort((a, b) => a[1].getTime() - b[1].getTime())
    .slice(0, LIMITE_SEM_RESPOSTA);
  if (escolhidas.length === 0) return [];

  const ids = escolhidas.map(([id]) => id);
  const dados = await linhas<{
    id: string;
    nome: string | null;
    telefone: string | null;
    estagio_nome: string | null;
  }>(
    executor,
    sql`select p.id, p.nome_exibicao as nome, s.nome as estagio_nome,
        (select i.valor from identificadores i where i.pessoa_id = p.id and i.tipo = 'telefone'
          order by i.criado_em, i.id limit 1) as telefone
      from pessoas p left join estagios s on s.id = p.estagio_id
      where p.id in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
  );
  const porId = new Map(dados.map((d) => [d.id, d]));
  return escolhidas.map(([id, desde]) => ({
    pessoaId: id,
    nome: porId.get(id)?.nome ?? null,
    telefone: porId.get(id)?.telefone ?? null,
    estagioNome: porId.get(id)?.estagio_nome ?? null,
    aguardandoDesde: desde instanceof Date ? desde : new Date(desde),
  }));
}
