import type { Executor } from "@/db";
import { numeros } from "@/db/schema";

/**
 * Garante a linha do número monitorado em `numeros` (já na forma canônica).
 * Número novo entra sem apelido e sem papel; se `usuarioId` vier (usuário do dispositivo),
 * fica vinculado a ele. Número existente não é alterado (a gestão edita pela tela).
 */
export async function garantirNumero(
  executor: Executor,
  numero: string,
  usuarioId: string | null = null,
): Promise<void> {
  await executor
    .insert(numeros)
    .values({ numero, apelido: null, papel: null, usuarioId })
    .onConflictDoNothing({ target: numeros.numero });
}
