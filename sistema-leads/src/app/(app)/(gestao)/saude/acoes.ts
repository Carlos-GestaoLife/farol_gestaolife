"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import "@/lib/zod-ptbr";
import { db } from "@/db";
import { entradasBrutas, filaRevisao } from "@/db/schema";
import { primeiroErro, type EstadoAcao } from "@/lib/acoes";
import { exigirPapel } from "@/lib/sessao";
import { processarEntrada, processarPendentes } from "@/nucleo/entradas";
import { executarMescla } from "@/nucleo/mescla";
import { LIMITE_REPROCESSAMENTO, MAX_TENTATIVAS } from "@/nucleo/reprocessamento";

// Server Actions da tela Saúde (só gestão): reprocessar e ignorar entradas, reprocessar tudo,
// mesclar ou descartar itens da fila de revisão de identidade.

const CAMINHO = "/saude";
const idSchema = z.uuid({ error: "Identificador inválido" });

const DESCRICAO_STATUS: Record<string, string> = {
  processado: "processada com sucesso",
  sem_efeito: "já estava processada ou ignorada (sem efeito)",
  nao_encontrada: "não encontrada",
};

/** Reprocessa uma entrada. `forcar` reprocessa mesmo já processada (reatribuição de origem). */
export async function reprocessarEntrada(id: string, forcar: boolean): Promise<EstadoAcao> {
  const sessao = await exigirPapel("gestao");
  const r = z.object({ id: idSchema, forcar: z.boolean() }).safeParse({ id, forcar });
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error) };

  const resultado = await processarEntrada(r.data.id, { forcar: r.data.forcar });
  console.info(
    `Entrada ${r.data.id} reprocessada${r.data.forcar ? " (forçado)" : ""} por ${sessao.user.email}: ${resultado.status}`,
  );
  revalidatePath(CAMINHO);
  if (resultado.status === "erro") {
    return { ok: false, mensagem: `Continua com erro: ${resultado.erro ?? "erro desconhecido"}` };
  }
  return {
    ok: resultado.status !== "nao_encontrada",
    mensagem: `Entrada ${DESCRICAO_STATUS[resultado.status] ?? resultado.status}.`,
  };
}

/**
 * Ignora uma entrada com erro ou pendente: status `ignorado` e `processado_em` = agora. A
 * mensagem de erro fica como estava; quem ignorou vai para o log do servidor.
 */
export async function ignorarEntrada(id: string): Promise<EstadoAcao> {
  const sessao = await exigirPapel("gestao");
  const r = idSchema.safeParse(id);
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error) };

  const alteradas = await db
    .update(entradasBrutas)
    .set({ status: "ignorado", processadoEm: new Date() })
    .where(and(eq(entradasBrutas.id, r.data), inArray(entradasBrutas.status, ["erro", "pendente"])))
    .returning({ id: entradasBrutas.id, fonte: entradasBrutas.fonte, chave: entradasBrutas.chaveIdempotencia });
  if (alteradas.length === 0) {
    return { ok: false, mensagem: "Só entradas com erro ou pendentes podem ser ignoradas" };
  }
  const [e] = alteradas;
  console.info(
    `Entrada ${e.id} (${e.fonte}/${e.chave}) ignorada por ${sessao.user.email} (${sessao.user.id}) em ${new Date().toISOString()}`,
  );
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Entrada ignorada." };
}

export type EstadoReprocessamento = EstadoAcao & {
  resumo?: { total: number; processadas: number; erros: number };
};

/** Botão global: reprocessa pendentes e erros (até 100, com menos de 10 tentativas). */
export async function reprocessarTodas(): Promise<EstadoReprocessamento> {
  const sessao = await exigirPapel("gestao");
  const r = await processarPendentes({ limite: LIMITE_REPROCESSAMENTO, maxTentativas: MAX_TENTATIVAS });
  console.info(
    `Reprocessamento manual por ${sessao.user.email}: ${r.total} entradas, ${r.processadas} processadas, ${r.erros} com erro`,
  );
  revalidatePath(CAMINHO);
  return {
    ok: true,
    mensagem:
      r.total === 0
        ? "Nada para reprocessar."
        : `${r.total} entradas: ${r.processadas} processadas, ${r.erros} com erro.`,
    resumo: { total: r.total, processadas: r.processadas, erros: r.erros },
  };
}

const mesclaSchema = z.object({
  itemId: idSchema,
  sobreviventeId: idSchema,
  absorvidaId: idSchema,
});

/** Mescla as duas pessoas de um item da fila (a absorvida vai para a sobrevivente). */
export async function mesclarItemRevisao(
  itemId: string,
  sobreviventeId: string,
  absorvidaId: string,
): Promise<EstadoAcao> {
  const sessao = await exigirPapel("gestao");
  const r = mesclaSchema.safeParse({ itemId, sobreviventeId, absorvidaId });
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error) };

  // A mescla precisa ser de uma das duas pessoas do item.
  const [item] = await db
    .select({ a: filaRevisao.pessoaAId, b: filaRevisao.pessoaBId, status: filaRevisao.status })
    .from(filaRevisao)
    .where(eq(filaRevisao.id, r.data.itemId));
  if (!item) return { ok: false, mensagem: "Item da fila não encontrado" };
  if (item.status !== "aberta") return { ok: false, mensagem: "Este item já foi resolvido" };
  const par = [item.a, item.b];
  if (!par.includes(r.data.sobreviventeId) || !par.includes(r.data.absorvidaId)) {
    return { ok: false, mensagem: "As pessoas não correspondem ao item da fila" };
  }

  const resultado = await executarMescla({
    sobreviventeId: r.data.sobreviventeId,
    absorvidaId: r.data.absorvidaId,
    usuarioId: sessao.user.id,
    filaRevisaoId: r.data.itemId,
  });
  if (resultado.ok) {
    revalidatePath(CAMINHO);
    revalidatePath("/leads");
    revalidatePath("/kanban");
  }
  return resultado;
}

/** Descarta um item da fila (as pessoas continuam separadas). */
export async function descartarItemRevisao(itemId: string): Promise<EstadoAcao> {
  const sessao = await exigirPapel("gestao");
  const r = idSchema.safeParse(itemId);
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error) };
  const alterados = await db
    .update(filaRevisao)
    .set({ status: "descartada", resolvidoPor: sessao.user.id, resolvidoEm: new Date() })
    .where(and(eq(filaRevisao.id, r.data), eq(filaRevisao.status, "aberta")))
    .returning({ id: filaRevisao.id });
  if (alterados.length === 0) return { ok: false, mensagem: "Item não encontrado ou já resolvido" };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Item descartado: as pessoas continuam separadas." };
}
