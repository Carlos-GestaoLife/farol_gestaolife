import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { eventos } from "@/db/schema";

export type NovoEvento = typeof eventos.$inferInsert;

/**
 * Insere um evento só se ainda não existir outro com o mesmo `entrada_bruta_id` e `tipo`.
 * É o que torna os processadores reexecutáveis: reprocessar a mesma entrada não duplica a
 * linha do tempo. `eventos` só recebe linhas novas (nunca UPDATE ou DELETE).
 *
 * Sem `entradaBrutaId` não há como deduplicar e o evento é sempre inserido (ações da UI).
 */
export async function inserirEventoSeNaoExiste(
  tx: Tx,
  evento: NovoEvento,
): Promise<{ id: string; inserido: boolean }> {
  if (evento.entradaBrutaId) {
    const [existente] = await tx
      .select({ id: eventos.id })
      .from(eventos)
      .where(and(eq(eventos.entradaBrutaId, evento.entradaBrutaId), eq(eventos.tipo, evento.tipo)))
      .limit(1);
    if (existente) return { id: existente.id, inserido: false };
  }
  const [novo] = await tx.insert(eventos).values(evento).returning({ id: eventos.id });
  return { id: novo.id, inserido: true };
}
