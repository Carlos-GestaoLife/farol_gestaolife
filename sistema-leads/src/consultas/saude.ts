import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { dispositivos, entradasBrutas, estagios, filaRevisao, pessoas, user } from "@/db/schema";
import { escaparLike } from "./pessoas";

// Consultas da tela Saúde (gestão): dispositivos, entradas com erro ou pendentes e a fila de
// revisão de identidade. Uma consulta por bloco.

export type DispositivoSaude = {
  id: string;
  nome: string;
  usuario: string | null;
  numeroDetectado: string | null;
  ultimoSinalEm: Date | null;
  filaPendente: number;
  versaoExtensao: string | null;
  ativo: boolean;
};

export async function listarDispositivosSaude(executor: Executor = db): Promise<DispositivoSaude[]> {
  return executor
    .select({
      id: dispositivos.id,
      nome: dispositivos.nome,
      usuario: user.name,
      numeroDetectado: dispositivos.numeroDetectado,
      ultimoSinalEm: dispositivos.ultimoSinalEm,
      filaPendente: dispositivos.filaPendente,
      versaoExtensao: dispositivos.versaoExtensao,
      ativo: dispositivos.ativo,
    })
    .from(dispositivos)
    .leftJoin(user, eq(user.id, dispositivos.usuarioId))
    .orderBy(desc(dispositivos.ativo), asc(dispositivos.nome));
}

export const LIMITE_ENTRADAS_SAUDE = 100;

export type EntradaSaude = {
  id: string;
  fonte: string;
  chaveIdempotencia: string;
  recebidoEm: Date;
  status: "pendente" | "processado" | "erro" | "ignorado";
  tentativas: number;
  erro: string | null;
  processadoEm: Date | null;
};

const colunasEntrada = {
  id: entradasBrutas.id,
  fonte: entradasBrutas.fonte,
  chaveIdempotencia: entradasBrutas.chaveIdempotencia,
  recebidoEm: entradasBrutas.recebidoEm,
  status: entradasBrutas.status,
  tentativas: entradasBrutas.tentativas,
  erro: entradasBrutas.erro,
  processadoEm: entradasBrutas.processadoEm,
};

/** Entradas com status `erro` ou `pendente`, as mais recentes primeiro (até 100), e o total. */
export async function listarEntradasComProblema(
  executor: Executor = db,
): Promise<{ linhas: EntradaSaude[]; total: number; erros: number; pendentes: number }> {
  const linhas = await executor
    .select(colunasEntrada)
    .from(entradasBrutas)
    .where(inArray(entradasBrutas.status, ["erro", "pendente"]))
    .orderBy(desc(entradasBrutas.recebidoEm))
    .limit(LIMITE_ENTRADAS_SAUDE);
  const [contagem] = await executor
    .select({
      erros: sql<number>`count(*) filter (where ${entradasBrutas.status} = 'erro')::int`,
      pendentes: sql<number>`count(*) filter (where ${entradasBrutas.status} = 'pendente')::int`,
    })
    .from(entradasBrutas)
    .where(inArray(entradasBrutas.status, ["erro", "pendente"]));
  const erros = Number(contagem?.erros ?? 0);
  const pendentes = Number(contagem?.pendentes ?? 0);
  return { linhas, total: erros + pendentes, erros, pendentes };
}

/** Busca entradas pela chave de idempotência (igual ou contendo o termo), em qualquer status. */
export async function buscarEntradasPorChave(
  termo: string,
  executor: Executor = db,
): Promise<EntradaSaude[]> {
  const t = termo.trim();
  if (!t) return [];
  return executor
    .select(colunasEntrada)
    .from(entradasBrutas)
    .where(ilike(entradasBrutas.chaveIdempotencia, `%${escaparLike(t)}%`))
    .orderBy(sql`(${entradasBrutas.chaveIdempotencia} = ${t}) desc`, desc(entradasBrutas.recebidoEm))
    .limit(20);
}

export type PessoaRevisao = {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  estagioNome: string | null;
  eventos: number;
  mensagens: number;
  mescladaParaId: string | null;
};

export type ItemRevisao = {
  id: string;
  motivo: string | null;
  criadoEm: Date;
  pessoaA: PessoaRevisao | null;
  pessoaB: PessoaRevisao | null;
};

export const LIMITE_REVISOES = 100;

/** Itens abertos da fila de revisão com os dados das duas pessoas (uma consulta). */
export async function listarRevisoesAbertas(executor: Executor = db): Promise<ItemRevisao[]> {
  const pa = alias(pessoas, "pa");
  const pb = alias(pessoas, "pb");
  const ea = alias(estagios, "ea");
  const eb = alias(estagios, "eb");

  // Telefone e e-mail principais: o primeiro cadastrado (mesmo critério das listas de leads).
  const dePessoa = (p: { id: typeof pa.id | typeof pb.id }) => ({
    telefone: sql<string | null>`(select i.valor from identificadores i
      where i.pessoa_id = ${p.id} and i.tipo = 'telefone' order by i.criado_em, i.id limit 1)`,
    email: sql<string | null>`(select i.valor from identificadores i
      where i.pessoa_id = ${p.id} and i.tipo = 'email' order by i.criado_em, i.id limit 1)`,
    eventos: sql<number>`(select count(*)::int from eventos e where e.pessoa_id = ${p.id})`,
    mensagens: sql<number>`(select count(*)::int from mensagens m where m.pessoa_id = ${p.id})`,
  });
  const a = dePessoa(pa);
  const b = dePessoa(pb);

  const linhas = await executor
    .select({
      id: filaRevisao.id,
      motivo: filaRevisao.motivo,
      criadoEm: filaRevisao.criadoEm,
      aId: pa.id,
      aNome: pa.nomeExibicao,
      aMesclada: pa.mescladaParaId,
      aEstagio: ea.nome,
      aTelefone: a.telefone,
      aEmail: a.email,
      aEventos: a.eventos,
      aMensagens: a.mensagens,
      bId: pb.id,
      bNome: pb.nomeExibicao,
      bMesclada: pb.mescladaParaId,
      bEstagio: eb.nome,
      bTelefone: b.telefone,
      bEmail: b.email,
      bEventos: b.eventos,
      bMensagens: b.mensagens,
    })
    .from(filaRevisao)
    .leftJoin(pa, eq(pa.id, filaRevisao.pessoaAId))
    .leftJoin(pb, eq(pb.id, filaRevisao.pessoaBId))
    .leftJoin(ea, eq(ea.id, pa.estagioId))
    .leftJoin(eb, eq(eb.id, pb.estagioId))
    .where(eq(filaRevisao.status, "aberta"))
    .orderBy(asc(filaRevisao.criadoEm))
    .limit(LIMITE_REVISOES);

  return linhas.map((l) => ({
    id: l.id,
    motivo: l.motivo,
    criadoEm: l.criadoEm,
    pessoaA: l.aId
      ? {
          id: l.aId,
          nome: l.aNome,
          telefone: l.aTelefone,
          email: l.aEmail,
          estagioNome: l.aEstagio,
          eventos: Number(l.aEventos),
          mensagens: Number(l.aMensagens),
          mescladaParaId: l.aMesclada,
        }
      : null,
    pessoaB: l.bId
      ? {
          id: l.bId,
          nome: l.bNome,
          telefone: l.bTelefone,
          email: l.bEmail,
          estagioNome: l.bEstagio,
          eventos: Number(l.bEventos),
          mensagens: Number(l.bMensagens),
          mescladaParaId: l.bMesclada,
        }
      : null,
  }));
}
