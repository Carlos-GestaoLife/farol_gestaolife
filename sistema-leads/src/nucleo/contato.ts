import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { pessoas } from "@/db/schema";

/**
 * Atualiza o cache `primeiro_contato_em` (mínimo) e `ultimo_contato_em` (máximo) da pessoa
 * com a data de um contato. Reexecutável: usar a mesma data de novo não muda nada.
 */
export async function registrarDataContato(tx: Tx, pessoaId: string, data: Date): Promise<void> {
  const em = sql`${data.toISOString()}::timestamptz`;
  await tx
    .update(pessoas)
    .set({
      primeiroContatoEm: sql`least(coalesce(${pessoas.primeiroContatoEm}, ${em}), ${em})`,
      ultimoContatoEm: sql`greatest(coalesce(${pessoas.ultimoContatoEm}, ${em}), ${em})`,
      atualizadoEm: new Date(),
    })
    .where(eq(pessoas.id, pessoaId));
}
