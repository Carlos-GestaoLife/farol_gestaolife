import { createHash } from "node:crypto";
import { and, asc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { entradasBrutas, fonteEntrada } from "@/db/schema";
import { obterProcessador, type EntradaBruta, type OpcoesProcessamento } from "./registro";
// Registra todos os processadores (efeito colateral do import).
import "./processadores";

// Gravação idempotente em `entradas_brutas` e processamento das entradas.
// Regra "nada se perde": a entrada é gravada crua ANTES de qualquer processamento.

export { registrarProcessador, removerProcessador } from "./registro";
export type { EntradaBruta, FonteEntrada, OpcoesProcessamento, Processador } from "./registro";
export { inserirEventoSeNaoExiste } from "./eventos";

export const MAX_ENTRADAS_POR_CHAMADA = 100;
const MAX_TAMANHO_ERRO = 2000;

const itemEntradaSchema = z.object({
  fonte: z.enum(fonteEntrada.enumValues),
  chaveIdempotencia: z.string().trim().min(1).max(500),
  payload: z.unknown().refine((v) => v !== undefined, "payload obrigatório"),
});

const loteSchema = z.array(itemEntradaSchema).max(MAX_ENTRADAS_POR_CHAMADA);

export type ItemEntrada = z.input<typeof itemEntradaSchema>;

export type EntradaAceita = {
  fonte: EntradaBruta["fonte"];
  chave: string;
  id: string;
  /** Verdadeiro se a entrada já existia (reenvio): aceita sem efeito. */
  duplicada: boolean;
};

const chaveMapa = (fonte: string, chave: string) => `${fonte}\u0000${chave}`;

/**
 * Grava um lote de entradas (até 100) em `entradas_brutas`, com status `pendente`.
 * Idempotente por `(fonte, chave_idempotencia)`: o que já existia volta com `duplicada: true`
 * e o id existente. Nunca lança por duplicata; lança se o lote for inválido.
 */
export async function registrarEntradas(itens: ItemEntrada[]): Promise<{ aceitas: EntradaAceita[] }> {
  const lote = loteSchema.parse(itens);
  if (lote.length === 0) return { aceitas: [] };

  const inseridas = await db
    .insert(entradasBrutas)
    .values(
      lote.map((i) => ({ fonte: i.fonte, chaveIdempotencia: i.chaveIdempotencia, payload: i.payload })),
    )
    .onConflictDoNothing({ target: [entradasBrutas.fonte, entradasBrutas.chaveIdempotencia] })
    .returning({
      id: entradasBrutas.id,
      fonte: entradasBrutas.fonte,
      chave: entradasBrutas.chaveIdempotencia,
    });

  const novas = new Map(inseridas.map((r) => [chaveMapa(r.fonte, r.chave), r.id]));

  // As que não voltaram no RETURNING já existiam: busca os ids.
  const faltantes = lote.filter((i) => !novas.has(chaveMapa(i.fonte, i.chaveIdempotencia)));
  const existentes = new Map<string, string>();
  if (faltantes.length > 0) {
    const linhas = await db
      .select({
        id: entradasBrutas.id,
        fonte: entradasBrutas.fonte,
        chave: entradasBrutas.chaveIdempotencia,
      })
      .from(entradasBrutas)
      .where(
        and(
          inArray(entradasBrutas.fonte, [...new Set(faltantes.map((i) => i.fonte))]),
          inArray(entradasBrutas.chaveIdempotencia, [
            ...new Set(faltantes.map((i) => i.chaveIdempotencia)),
          ]),
        ),
      );
    for (const l of linhas) existentes.set(chaveMapa(l.fonte, l.chave), l.id);
  }

  // A mesma chave repetida dentro do lote conta como nova só na primeira ocorrência.
  const jaContadas = new Set<string>();
  const aceitas = lote.map((i): EntradaAceita => {
    const k = chaveMapa(i.fonte, i.chaveIdempotencia);
    const idNovo = novas.get(k);
    if (idNovo && !jaContadas.has(k)) {
      jaContadas.add(k);
      return { fonte: i.fonte, chave: i.chaveIdempotencia, id: idNovo, duplicada: false };
    }
    const id = idNovo ?? existentes.get(k);
    if (!id) throw new Error(`Entrada ${i.fonte}/${i.chaveIdempotencia} não encontrada após gravação`);
    return { fonte: i.fonte, chave: i.chaveIdempotencia, id, duplicada: true };
  });

  return { aceitas };
}

/** JSON estável: chaves de objetos em ordem alfabética, em qualquer profundidade. */
export function jsonEstavel(valor: unknown): string {
  return JSON.stringify(ordenar(valor)) ?? "null";
}

function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === "object" && !(valor instanceof Date)) {
    const obj = valor as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, ordenar(obj[k])]),
    );
  }
  return valor;
}

/** SHA-256 (hex) do JSON estável do payload. Chave de idempotência do webhook do Framer. */
export function chaveSha256(payload: unknown): string {
  return createHash("sha256").update(jsonEstavel(payload)).digest("hex");
}

export type ResultadoProcessamento = {
  id: string;
  status: "processado" | "erro" | "sem_efeito" | "nao_encontrada";
  erro?: string;
};

const STATUS_FINAIS: EntradaBruta["status"][] = ["processado", "ignorado"];

function mensagemDeErro(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message || erro.name : String(erro);
  return texto.slice(0, MAX_TAMANHO_ERRO);
}

/** Grava o erro FORA da transação que falhou (que já foi desfeita). */
async function marcarErro(id: string, mensagem: string): Promise<void> {
  await db
    .update(entradasBrutas)
    .set({
      status: "erro",
      erro: mensagem.slice(0, MAX_TAMANHO_ERRO),
      tentativas: sql`${entradasBrutas.tentativas} + 1`,
    })
    // Não sobrescreve uma entrada que outro processo acabou de concluir.
    .where(and(eq(entradasBrutas.id, id), notInArray(entradasBrutas.status, STATUS_FINAIS)));
}

/**
 * Processa uma entrada com o processador da sua fonte, dentro de `db.transaction`.
 * - Já `processado` ou `ignorado`: retorna sem efeito (a não ser com `forcar`).
 * - Sucesso: status `processado`, `processado_em` = agora, `erro` = null (na mesma transação).
 * - Sem processador ou exceção: transação desfeita; status `erro`, mensagem e tentativas + 1.
 *   Num reprocessamento forçado que falha, a entrada que já estava `processado` continua assim.
 *
 * `forcar` (pedido explícito da gestão): reprocessa mesmo já processada. Os processadores são
 * reexecutáveis, então nada duplica; um toque que ficou sem origem e agora casa com uma ganha
 * um evento novo de reatribuição (ver `inserirEventoSeNaoExiste`).
 */
export async function processarEntrada(
  id: string,
  opcoes: OpcoesProcessamento = {},
): Promise<ResultadoProcessamento> {
  const forcar = opcoes.forcar === true;
  const [entrada] = await db
    .select({ fonte: entradasBrutas.fonte, status: entradasBrutas.status })
    .from(entradasBrutas)
    .where(eq(entradasBrutas.id, id));
  if (!entrada) return { id, status: "nao_encontrada" };
  if (!forcar && STATUS_FINAIS.includes(entrada.status)) return { id, status: "sem_efeito" };

  const processador = obterProcessador(entrada.fonte);
  if (!processador) {
    const erro = `Sem processador para a fonte ${entrada.fonte}`;
    await marcarErro(id, erro);
    return { id, status: "erro", erro };
  }

  try {
    const feito = await db.transaction(async (tx) => {
      // Trava a linha: dois processamentos simultâneos da mesma entrada ficam em fila.
      const [atual] = await tx
        .select()
        .from(entradasBrutas)
        .where(eq(entradasBrutas.id, id))
        .for("update");
      if (!atual || (!forcar && STATUS_FINAIS.includes(atual.status))) return false;

      await processador(tx, atual, { forcar });

      await tx
        .update(entradasBrutas)
        .set({ status: "processado", processadoEm: new Date(), erro: null })
        .where(eq(entradasBrutas.id, id));
      return true;
    });
    return { id, status: feito ? "processado" : "sem_efeito" };
  } catch (e) {
    const erro = mensagemDeErro(e);
    await marcarErro(id, erro);
    return { id, status: "erro", erro };
  }
}

/**
 * Processa as entradas `pendente` e `erro` com menos de `maxTentativas` tentativas, das mais
 * antigas para as mais novas, uma por vez. Usado pelo reprocessamento (Etapa 10).
 */
export async function processarPendentes(
  opcoes: { limite?: number; maxTentativas?: number } = {},
): Promise<{
  total: number;
  processadas: number;
  erros: number;
  resultados: ResultadoProcessamento[];
}> {
  const { limite = 50, maxTentativas = 10 } = opcoes;
  const pendentes = await db
    .select({ id: entradasBrutas.id })
    .from(entradasBrutas)
    .where(
      and(
        inArray(entradasBrutas.status, ["pendente", "erro"]),
        lt(entradasBrutas.tentativas, maxTentativas),
      ),
    )
    .orderBy(asc(entradasBrutas.recebidoEm))
    .limit(limite);

  const resultados: ResultadoProcessamento[] = [];
  for (const { id } of pendentes) {
    resultados.push(await processarEntrada(id));
  }
  return {
    total: resultados.length,
    processadas: resultados.filter((r) => r.status === "processado").length,
    erros: resultados.filter((r) => r.status === "erro").length,
    resultados,
  };
}
