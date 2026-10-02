import type { Tx } from "@/db";
import type { entradasBrutas } from "@/db/schema";

// Registro de processadores por fonte. Fica num módulo próprio (sem importar os
// processadores) para não haver import circular com `entradas.ts`.

export type EntradaBruta = typeof entradasBrutas.$inferSelect;
export type FonteEntrada = EntradaBruta["fonte"];

/**
 * Processador de uma fonte. Roda dentro de `db.transaction` e recebe a transação e a entrada.
 *
 * REGRA: todo processador deve ser reexecutável (idempotente), porque uma entrada com erro
 * volta a ser processada pelo reprocessamento e uma falha no meio desfaz só a transação.
 * - eventos: usar `inserirEventoSeNaoExiste` (mesmo `entrada_bruta_id` e `tipo` não duplica);
 * - mensagens: inserir com ON CONFLICT DO NOTHING (único em numero_monitorado + wa_msg_id);
 * - identidade: `resolverPessoa` já é idempotente (identificadores com ON CONFLICT DO NOTHING
 *   e no máximo um item aberto por par na fila de revisão).
 */
export type Processador = (tx: Tx, entrada: EntradaBruta) => Promise<void>;

const processadores = new Map<FonteEntrada, Processador>();

/** Registra (ou substitui) o processador de uma fonte. */
export function registrarProcessador(fonte: FonteEntrada, fn: Processador): void {
  processadores.set(fonte, fn);
}

/** Remove o processador de uma fonte (usado nos testes). */
export function removerProcessador(fonte: FonteEntrada): void {
  processadores.delete(fonte);
}

export function obterProcessador(fonte: FonteEntrada): Processador | undefined {
  return processadores.get(fonte);
}
