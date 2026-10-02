import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { filaRevisao, identificadores, pessoas } from "@/db/schema";
import {
  normalizarEmail,
  normalizarTelefone,
  normalizarWaId,
  telefoneDeWaId,
} from "./normalizacao";

// Resolução de identidade (seção "Resolução de identidade" do CLAUDE.md do sistema-leads).
// Nunca mescla pessoas: em conflito, vincula à pessoa do identificador mais forte e abre
// um item em `fila_revisao` para a gestão decidir.

export type TipoIdentificador = "telefone" | "email" | "wa_id" | "meta_lead_id";

export type Identificador = {
  tipo: TipoIdentificador;
  /** Valor normalizado (forma canônica). */
  valor: string;
  /** Valor como chegou, antes da normalização. */
  valorOriginal?: string;
};

/** Força de cada tipo: quanto menor, mais forte (telefone > wa_id > email > meta_lead_id). */
export const FORCA_IDENTIFICADOR: Record<TipoIdentificador, number> = {
  telefone: 0,
  wa_id: 1,
  email: 2,
  meta_lead_id: 3,
};

const ROTULO: Record<TipoIdentificador, string> = {
  telefone: "telefone",
  wa_id: "wa_id",
  email: "e-mail",
  meta_lead_id: "lead da Meta",
};

function porForca(a: Identificador, b: Identificador): number {
  return FORCA_IDENTIFICADOR[a.tipo] - FORCA_IDENTIFICADOR[b.tipo];
}

function chave(tipo: string, valor: string): string {
  return `${tipo}:${valor}`;
}

export type DadosIdentificacao = {
  telefone?: string | null;
  email?: string | null;
  waId?: string | null;
  metaLeadId?: string | null;
};

/**
 * Monta a lista de identificadores normalizados de uma entrada, do mais forte para o mais
 * fraco. Descarta inválidos e duplicados. De um wa_id `@c.us` deriva também o telefone.
 */
export function montarIdentificadores(dados: DadosIdentificacao): Identificador[] {
  const lista: Identificador[] = [];
  const vistos = new Set<string>();
  const adicionar = (tipo: TipoIdentificador, valor: string | null, valorOriginal: string) => {
    if (!valor) return;
    const k = chave(tipo, valor);
    if (vistos.has(k)) return;
    vistos.add(k);
    lista.push({ tipo, valor, valorOriginal });
  };

  if (dados.telefone) adicionar("telefone", normalizarTelefone(dados.telefone), dados.telefone);
  if (dados.waId) {
    const waId = normalizarWaId(dados.waId);
    adicionar("wa_id", waId, dados.waId);
    if (waId) adicionar("telefone", telefoneDeWaId(waId), dados.waId);
  }
  if (dados.email) adicionar("email", normalizarEmail(dados.email), dados.email);
  if (dados.metaLeadId) {
    const id = dados.metaLeadId.trim();
    adicionar("meta_lead_id", /^\d{1,30}$/.test(id) ? id : null, dados.metaLeadId);
  }

  return lista.sort(porForca);
}

export type ResultadoResolucao = {
  pessoaId: string;
  criada: boolean;
  conflito: boolean;
};

export type OpcoesResolucao = {
  nomeExibicao?: string | null;
  entradaBrutaId?: string | null;
};

const LIMITE_CADEIA_MESCLA = 20;

/** Segue `mesclada_para_id` até a pessoa sobrevivente. */
async function sobrevivente(tx: Tx, pessoaId: string): Promise<string> {
  let atual = pessoaId;
  const visitadas = new Set<string>();
  for (let i = 0; i < LIMITE_CADEIA_MESCLA; i++) {
    visitadas.add(atual);
    const [linha] = await tx
      .select({ mescladaParaId: pessoas.mescladaParaId })
      .from(pessoas)
      .where(eq(pessoas.id, atual));
    const proxima = linha?.mescladaParaId;
    if (!proxima || visitadas.has(proxima)) return atual;
    atual = proxima;
  }
  throw new Error(`Cadeia de mescla longa demais a partir da pessoa ${pessoaId}`);
}

/**
 * Descobre a pessoa dona dos identificadores (ou cria uma) dentro da transação `tx`.
 *
 * - Nenhuma pessoa: cria a pessoa e todos os identificadores.
 * - Uma pessoa: vincula e adiciona os identificadores novos.
 * - Duas ou mais: NÃO mescla. Vincula à pessoa do identificador mais forte, adiciona a ela os
 *   identificadores que ainda não têm dono e abre um item `conflito_identidade` em
 *   `fila_revisao` para cada outra pessoa envolvida (se ainda não houver um aberto para o par).
 *
 * Pessoas mescladas são seguidas por `mesclada_para_id` até a sobrevivente.
 * Lança erro se a lista de identificadores estiver vazia.
 */
export async function resolverPessoa(
  tx: Tx,
  lista: Identificador[],
  opcoes: OpcoesResolucao = {},
): Promise<ResultadoResolucao> {
  const ids = dedupe(lista).sort(porForca);
  if (ids.length === 0) {
    throw new Error("Nenhum identificador válido para resolver a pessoa");
  }
  const nome = opcoes.nomeExibicao?.trim() || null;
  const entradaBrutaId = opcoes.entradaBrutaId ?? null;

  // Trava por identificador (até o fim da transação), em ordem fixa para não haver deadlock.
  // Assim duas entradas simultâneas do mesmo telefone não criam duas pessoas.
  const chaves = ids.map((i) => chave(i.tipo, i.valor)).sort();
  for (const k of chaves) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${k}, 0))`);
  }

  const existentes = await tx
    .select({
      tipo: identificadores.tipo,
      valor: identificadores.valor,
      pessoaId: identificadores.pessoaId,
    })
    .from(identificadores)
    .where(
      or(...ids.map((i) => and(eq(identificadores.tipo, i.tipo), eq(identificadores.valor, i.valor)))),
    );

  // Pessoa sobrevivente de cada identificador encontrado, na ordem de força da entrada.
  const donoPorChave = new Map<string, string>();
  for (const e of existentes) {
    donoPorChave.set(chave(e.tipo, e.valor), await sobrevivente(tx, e.pessoaId));
  }
  const pessoasEmOrdem: string[] = [];
  for (const i of ids) {
    const dono = donoPorChave.get(chave(i.tipo, i.valor));
    if (dono && !pessoasEmOrdem.includes(dono)) pessoasEmOrdem.push(dono);
  }

  let pessoaId: string;
  let criada = false;
  if (pessoasEmOrdem.length === 0) {
    const [nova] = await tx
      .insert(pessoas)
      .values({ nomeExibicao: nome, primeiroContatoEm: new Date() })
      .returning({ id: pessoas.id });
    pessoaId = nova.id;
    criada = true;
  } else {
    pessoaId = pessoasEmOrdem[0];
  }

  // Identificadores sem dono vão para a pessoa escolhida. Os que já têm dono ficam onde estão.
  const novos = ids.filter((i) => !donoPorChave.has(chave(i.tipo, i.valor)));
  if (novos.length > 0) {
    await tx
      .insert(identificadores)
      .values(
        novos.map((i) => ({
          pessoaId,
          tipo: i.tipo,
          valor: i.valor,
          valorOriginal: i.valorOriginal ?? null,
        })),
      )
      .onConflictDoNothing({ target: [identificadores.tipo, identificadores.valor] });
  }

  if (!criada) {
    await tx
      .update(pessoas)
      .set({
        // Só preenche o nome se a pessoa ainda não tiver um.
        nomeExibicao: nome ? sql`coalesce(${pessoas.nomeExibicao}, ${nome})` : undefined,
        atualizadoEm: new Date(),
      })
      .where(eq(pessoas.id, pessoaId));
  }

  const outras = pessoasEmOrdem.slice(1);
  for (const outra of outras) {
    await abrirConflitoSeNaoExiste(tx, {
      pessoaA: pessoaId,
      pessoaB: outra,
      motivo: descreverConflito(ids, donoPorChave, pessoaId, outra),
      entradaBrutaId,
    });
  }

  return { pessoaId, criada, conflito: outras.length > 0 };
}

function dedupe(lista: Identificador[]): Identificador[] {
  const vistos = new Set<string>();
  return lista.filter((i) => {
    const k = chave(i.tipo, i.valor);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

function descreverConflito(
  ids: Identificador[],
  donoPorChave: Map<string, string>,
  pessoaA: string,
  pessoaB: string,
): string {
  const de = (pessoa: string) =>
    ids
      .filter((i) => donoPorChave.get(chave(i.tipo, i.valor)) === pessoa)
      .map((i) => `${ROTULO[i.tipo]} ${i.valor}`)
      .join(", ");
  return (
    `Conflito de identidade: a mesma entrada trouxe identificadores de duas pessoas. ` +
    `Da pessoa A (escolhida): ${de(pessoaA)}. Da pessoa B: ${de(pessoaB)}. ` +
    `A entrada foi vinculada à pessoa A pelo identificador mais forte; nada foi mesclado.`
  );
}

async function abrirConflitoSeNaoExiste(
  tx: Tx,
  item: { pessoaA: string; pessoaB: string; motivo: string; entradaBrutaId: string | null },
): Promise<boolean> {
  // Trava pelo par (em qualquer ordem) para não abrir dois itens em entradas simultâneas.
  const par = [item.pessoaA, item.pessoaB].sort().join(":");
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"revisao:" + par}, 0))`);

  const [aberto] = await tx
    .select({ id: filaRevisao.id })
    .from(filaRevisao)
    .where(
      and(
        eq(filaRevisao.tipo, "conflito_identidade"),
        eq(filaRevisao.status, "aberta"),
        inArray(filaRevisao.pessoaAId, [item.pessoaA, item.pessoaB]),
        inArray(filaRevisao.pessoaBId, [item.pessoaA, item.pessoaB]),
      ),
    )
    .limit(1);
  if (aberto) return false;

  await tx.insert(filaRevisao).values({
    tipo: "conflito_identidade",
    pessoaAId: item.pessoaA,
    pessoaBId: item.pessoaB,
    motivo: item.motivo,
    entradaBrutaId: item.entradaBrutaId,
    status: "aberta",
  });
  return true;
}
