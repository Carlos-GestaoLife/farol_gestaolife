import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { mensagens, origens, pessoas, user } from "@/db/schema";
import {
  condicoesPessoas,
  listarEstagios,
  telefonePrincipalSql,
  emailPrincipalSql,
  type FiltrosPessoas,
  type OpcaoEstagio,
} from "./pessoas";

// Consultas do kanban: cartões por estágio (limite por coluna, com o total) e o tempo sem
// resposta de cada pessoa. Uma consulta para os cartões e uma para o "sem resposta".

export const LIMITE_POR_COLUNA = 200;

export type CartaoKanban = {
  id: string;
  estagioId: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  origemNome: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  ultimoContatoEm: Date | null;
  /** Desde quando a pessoa espera resposta (null se não espera). */
  aguardandoDesde: Date | null;
};

export type ColunaKanban = OpcaoEstagio & { total: number; cartoes: CartaoKanban[] };

/**
 * Desde quando cada pessoa espera resposta: em cada chat, a primeira mensagem recebida (`in`)
 * depois da última enviada (`out`). Chat cuja última mensagem é `out` (ou sem mensagens) não
 * espera. Com vários chats esperando, vale o mais antigo. Pessoas fora do mapa não esperam.
 */
export async function aguardandoRespostaPorPessoa(
  pessoaIds: string[],
  executor: Executor = db,
): Promise<Map<string, Date>> {
  const mapa = new Map<string, Date>();
  if (pessoaIds.length === 0) return mapa;

  const ultimaEnviada = executor
    .select({
      pessoaId: mensagens.pessoaId,
      numeroMonitorado: mensagens.numeroMonitorado,
      chatId: mensagens.chatId,
      ultimaOut: sql<Date | null>`max(${mensagens.enviadaEm}) filter (where ${mensagens.direcao} = 'out')`.as(
        "ultima_out",
      ),
    })
    .from(mensagens)
    .where(inArray(mensagens.pessoaId, pessoaIds))
    .groupBy(mensagens.pessoaId, mensagens.numeroMonitorado, mensagens.chatId)
    .as("ultima_enviada");

  const linhas = await executor
    .select({
      pessoaId: mensagens.pessoaId,
      desde: sql<string>`min(${mensagens.enviadaEm})`.mapWith((v: string | Date) => new Date(v)),
    })
    .from(mensagens)
    .innerJoin(
      ultimaEnviada,
      and(
        eq(ultimaEnviada.pessoaId, mensagens.pessoaId),
        eq(ultimaEnviada.numeroMonitorado, mensagens.numeroMonitorado),
        eq(ultimaEnviada.chatId, mensagens.chatId),
      ),
    )
    .where(
      and(
        inArray(mensagens.pessoaId, pessoaIds),
        eq(mensagens.direcao, "in"),
        sql`(${ultimaEnviada.ultimaOut} is null or ${mensagens.enviadaEm} > ${ultimaEnviada.ultimaOut})`,
      ),
    )
    .groupBy(mensagens.pessoaId);

  for (const l of linhas) mapa.set(l.pessoaId, l.desde as unknown as Date);
  return mapa;
}

/**
 * Colunas do kanban (estágios por ordem) com até `LIMITE_POR_COLUNA` cartões cada (os de
 * último contato mais recente) e o total da coluna. Pessoa sem estágio aparece no primeiro.
 * Pessoas mescladas não aparecem.
 */
export async function carregarKanban(
  filtros: Pick<FiltrosPessoas, "busca" | "responsavelId">,
  executor: Executor = db,
): Promise<ColunaKanban[]> {
  const estagios = await listarEstagios(executor);
  if (estagios.length === 0) return [];
  const inicial = estagios[0].id;

  const estagioEfetivo = sql<string>`coalesce(${pessoas.estagioId}, ${inicial}::uuid)`;
  const base = executor
    .select({
      id: pessoas.id,
      estagioId: estagioEfetivo.as("estagio_efetivo"),
      nome: pessoas.nomeExibicao,
      telefone: telefonePrincipalSql.as("telefone"),
      email: emailPrincipalSql.as("email"),
      origemNome: sql<string | null>`${origens.nome}`.as("origem_nome"),
      responsavelId: pessoas.responsavelId,
      responsavelNome: sql<string | null>`${user.name}`.as("responsavel_nome"),
      ultimoContatoEm: pessoas.ultimoContatoEm,
      posicao: sql<number>`row_number() over (partition by ${estagioEfetivo}
        order by ${pessoas.ultimoContatoEm} desc nulls last, ${pessoas.criadoEm} desc, ${pessoas.id})`.as(
        "posicao",
      ),
      total: sql<number>`count(*) over (partition by ${estagioEfetivo})`.as("total"),
    })
    .from(pessoas)
    .leftJoin(origens, eq(origens.id, pessoas.origemPrimeiroToqueId))
    .leftJoin(user, eq(user.id, pessoas.responsavelId))
    .where(and(...condicoesPessoas(filtros)))
    .as("base");

  const linhas = await executor
    .select()
    .from(base)
    .where(sql`${base.posicao} <= ${LIMITE_POR_COLUNA}`)
    .orderBy(base.estagioId, base.posicao);

  const aguardando = await aguardandoRespostaPorPessoa(
    linhas.map((l) => l.id),
    executor,
  );

  const porEstagio = new Map<string, { total: number; cartoes: CartaoKanban[] }>();
  for (const l of linhas) {
    const grupo = porEstagio.get(l.estagioId) ?? { total: Number(l.total), cartoes: [] };
    grupo.cartoes.push({
      id: l.id,
      estagioId: l.estagioId,
      nome: l.nome,
      telefone: l.telefone,
      email: l.email,
      origemNome: l.origemNome,
      responsavelId: l.responsavelId,
      responsavelNome: l.responsavelNome,
      ultimoContatoEm: l.ultimoContatoEm ? new Date(l.ultimoContatoEm) : null,
      aguardandoDesde: aguardando.get(l.id) ?? null,
    });
    porEstagio.set(l.estagioId, grupo);
  }

  return estagios.map((e) => ({
    ...e,
    total: porEstagio.get(e.id)?.total ?? 0,
    cartoes: porEstagio.get(e.id)?.cartoes ?? [],
  }));
}
