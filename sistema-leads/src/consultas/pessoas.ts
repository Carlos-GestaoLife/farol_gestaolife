import { and, asc, desc, eq, gte, ilike, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { estagios, identificadores, origens, pessoas, user } from "@/db/schema";
import { normalizarTelefone } from "@/nucleo/normalizacao";

// Consultas de pessoas (leads) reutilizadas pelas telas Leads e Kanban.
// Pessoas mescladas (`mesclada_para_id` preenchido) nunca entram nas listas.

export type FiltrosPessoas = {
  /** Busca livre: nome, telefone (normalizado ou trecho de dígitos) ou e-mail. */
  busca?: string | null;
  origemId?: string | null;
  cidade?: string | null;
  estagioId?: string | null;
  /** Id do usuário, ou "sem" para quem não tem responsável. */
  responsavelId?: string | null;
  /** Primeiro contato a partir deste instante (inclusive). */
  primeiroContatoDe?: Date | null;
  /** Primeiro contato antes deste instante (exclusivo). */
  primeiroContatoAte?: Date | null;
};

export const SEM_RESPONSAVEL = "sem";

/** Escapa %, _ e \ para usar o termo dentro de um LIKE. */
export function escaparLike(termo: string): string {
  return termo.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Telefone principal: o primeiro telefone cadastrado da pessoa. */
export const telefonePrincipalSql = sql<string | null>`(
  select i.valor from ${identificadores} i
  where i.pessoa_id = ${pessoas.id} and i.tipo = 'telefone'
  order by i.criado_em, i.id limit 1
)`;

/** E-mail principal: o primeiro e-mail cadastrado da pessoa. */
export const emailPrincipalSql = sql<string | null>`(
  select i.valor from ${identificadores} i
  where i.pessoa_id = ${pessoas.id} and i.tipo = 'email'
  order by i.criado_em, i.id limit 1
)`;

/**
 * Cidade do último formulário enviado que tinha cidade (LP grava em `dados.cidade`,
 * Meta em `dados.campos.cidade`).
 */
export const cidadeSql = sql<string | null>`(
  select coalesce(nullif(trim(e.dados->>'cidade'), ''), nullif(trim(e.dados->'campos'->>'cidade'), ''))
  from eventos e
  where e.pessoa_id = ${pessoas.id} and e.tipo = 'form_enviado'
    and coalesce(nullif(trim(e.dados->>'cidade'), ''), nullif(trim(e.dados->'campos'->>'cidade'), '')) is not null
  order by e.ocorrido_em desc limit 1
)`;

/** Condição da busca livre (nome, telefone ou e-mail). Null se o termo for vazio. */
export function condicaoBusca(termoBruto: string | null | undefined): SQL | null {
  const termo = termoBruto?.trim();
  if (!termo) return null;
  const like = `%${escaparLike(termo)}%`;
  const condicoes: SQL[] = [
    ilike(pessoas.nomeExibicao, like),
    sql`exists (select 1 from ${identificadores} i where i.pessoa_id = ${pessoas.id}
      and i.tipo in ('email', 'telefone') and i.valor ilike ${like.toLowerCase()})`,
  ];
  const digitos = termo.replace(/\D/g, "");
  if (digitos.length >= 4) {
    condicoes.push(
      sql`exists (select 1 from ${identificadores} i where i.pessoa_id = ${pessoas.id}
        and i.tipo = 'telefone' and i.valor like ${`%${digitos}%`})`,
    );
  }
  // Telefone digitado em qualquer formato (com ou sem o nono dígito): compara pela forma canônica.
  const canonico = normalizarTelefone(termo);
  if (canonico) {
    condicoes.push(
      sql`exists (select 1 from ${identificadores} i where i.pessoa_id = ${pessoas.id}
        and i.tipo = 'telefone' and i.valor = ${canonico})`,
    );
  }
  return or(...condicoes) ?? null;
}

/** Todas as condições dos filtros, sempre excluindo pessoas mescladas. */
export function condicoesPessoas(filtros: FiltrosPessoas): SQL[] {
  const condicoes: SQL[] = [isNull(pessoas.mescladaParaId)];
  const busca = condicaoBusca(filtros.busca);
  if (busca) condicoes.push(busca);
  if (filtros.origemId) condicoes.push(eq(pessoas.origemPrimeiroToqueId, filtros.origemId));
  if (filtros.estagioId) condicoes.push(eq(pessoas.estagioId, filtros.estagioId));
  if (filtros.responsavelId === SEM_RESPONSAVEL) condicoes.push(isNull(pessoas.responsavelId));
  else if (filtros.responsavelId) condicoes.push(eq(pessoas.responsavelId, filtros.responsavelId));
  const cidade = filtros.cidade?.trim();
  if (cidade) condicoes.push(sql`${cidadeSql} ilike ${`%${escaparLike(cidade)}%`}`);
  if (filtros.primeiroContatoDe) condicoes.push(gte(pessoas.primeiroContatoEm, filtros.primeiroContatoDe));
  if (filtros.primeiroContatoAte) condicoes.push(lt(pessoas.primeiroContatoEm, filtros.primeiroContatoAte));
  return condicoes;
}

export type LinhaPessoa = {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  estagioId: string | null;
  estagioNome: string | null;
  origemNome: string | null;
  cidade: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  primeiroContatoEm: Date | null;
  ultimoContatoEm: Date | null;
};

/** Ordem padrão das listas: último contato mais recente primeiro (sem contato no fim). */
export const ordemUltimoContato = [
  sql`${pessoas.ultimoContatoEm} desc nulls last`,
  desc(pessoas.criadoEm),
  asc(pessoas.id),
];

/**
 * Lista paginada de pessoas com os filtros, em UMA consulta (telefone, e-mail e cidade são
 * subconsultas escalares), mais a contagem total.
 */
export async function listarPessoas(
  filtros: FiltrosPessoas,
  paginacao: { pagina?: number; porPagina?: number } = {},
  executor: Executor = db,
): Promise<{ linhas: LinhaPessoa[]; total: number; pagina: number; porPagina: number }> {
  const porPagina = Math.min(Math.max(paginacao.porPagina ?? 50, 1), 500);
  const pagina = Math.max(Math.floor(paginacao.pagina ?? 1), 1);
  const onde = and(...condicoesPessoas(filtros));

  const linhas = await executor
    .select({
      id: pessoas.id,
      nome: pessoas.nomeExibicao,
      telefone: telefonePrincipalSql,
      email: emailPrincipalSql,
      estagioId: pessoas.estagioId,
      estagioNome: estagios.nome,
      origemNome: origens.nome,
      cidade: cidadeSql,
      responsavelId: pessoas.responsavelId,
      responsavelNome: user.name,
      primeiroContatoEm: pessoas.primeiroContatoEm,
      ultimoContatoEm: pessoas.ultimoContatoEm,
    })
    .from(pessoas)
    .leftJoin(estagios, eq(estagios.id, pessoas.estagioId))
    .leftJoin(origens, eq(origens.id, pessoas.origemPrimeiroToqueId))
    .leftJoin(user, eq(user.id, pessoas.responsavelId))
    .where(onde)
    .orderBy(...ordemUltimoContato)
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);

  const [{ total }] = await executor
    .select({ total: sql<number>`count(*)::int` })
    .from(pessoas)
    .where(onde);

  return { linhas, total, pagina, porPagina };
}

export type Opcao = { id: string; nome: string };

/** Usuários para os selects de responsável. */
export async function listarUsuariosOpcoes(executor: Executor = db): Promise<Opcao[]> {
  return executor.select({ id: user.id, nome: user.name }).from(user).orderBy(asc(user.name));
}

export type OpcaoEstagio = Opcao & { ordem: number; tipo: "aberto" | "ganho" | "perdido" };

/** Estágios na ordem do funil. */
export async function listarEstagios(executor: Executor = db): Promise<OpcaoEstagio[]> {
  return executor
    .select({ id: estagios.id, nome: estagios.nome, ordem: estagios.ordem, tipo: estagios.tipo })
    .from(estagios)
    .orderBy(asc(estagios.ordem), asc(estagios.nome));
}

/** Origens para o filtro da lista de leads. */
export async function listarOrigensOpcoes(executor: Executor = db): Promise<Opcao[]> {
  return executor.select({ id: origens.id, nome: origens.nome }).from(origens).orderBy(asc(origens.nome));
}
