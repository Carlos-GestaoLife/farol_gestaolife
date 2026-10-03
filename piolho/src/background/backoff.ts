// Backoff exponencial do envio (piolho/CLAUDE.md: "reenvio e backoff exponencial, teto de 5 min").
// Após a 1a falha seguida de rede ou 5xx espera 1 min; depois 2, 4 e daí em diante 5 min (teto).

export const BACKOFF_BASE_MS = 60_000;
export const BACKOFF_TETO_MS = 5 * 60_000;

/** Espera depois de `falhasSeguidas` falhas (1, 2, 3...). Zero ou negativo: sem espera. */
export function calcularBackoffMs(falhasSeguidas: number): number {
  if (!Number.isFinite(falhasSeguidas) || falhasSeguidas <= 0) return 0;
  // Limita o expoente para não estourar com contadores grandes.
  const expoente = Math.min(Math.floor(falhasSeguidas) - 1, 10);
  return Math.min(BACKOFF_BASE_MS * 2 ** expoente, BACKOFF_TETO_MS);
}
