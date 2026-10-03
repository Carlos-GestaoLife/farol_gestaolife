// Regras puras da varredura (Etapa 7) usadas pelo service worker e pelo MAIN world.
// Testadas em tests/varredura.test.ts.

export const DIA_MS = 24 * 60 * 60 * 1000;
/** A varredura nunca volta mais que isso. */
export const LIMITE_VARREDURA_DIAS = 30;
/** Varredura automática de novo depois de tanto tempo da última concluída. */
export const INTERVALO_VARREDURA_AUTO_MS = 6 * 60 * 60 * 1000;
/** Varredura "pedida" ou "rodando" sem notícia há mais que isso conta como interrompida. */
export const VARREDURA_SEM_SINAL_MS = 2 * 60 * 1000;

function msDe(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * `desde` do pedido de varredura, calculado no service worker:
 * - normal: o maior entre o checkpoint local do número e ultimo_sync_servidor (null se nenhum);
 * - forçada ("Forçar varredura" do painel): null, ou seja, só o limite de 30 dias vale.
 * O MAIN world ainda aplica o limite de 30 dias (checkpointEfetivo).
 */
export function desdeDoPedido(
  checkpointLocal: string | null,
  ultimoSyncServidor: string | null,
  forcada: boolean,
): string | null {
  if (forcada) return null;
  const a = msDe(checkpointLocal);
  const b = msDe(ultimoSyncServidor);
  if (a === null && b === null) return null;
  return new Date(Math.max(a ?? -Infinity, b ?? -Infinity)).toISOString();
}

/** Checkpoint efetivo em ms: o maior entre `desde` e agora menos 30 dias. */
export function checkpointEfetivo(desde: string | null, agoraMs: number): number {
  const limite = agoraMs - LIMITE_VARREDURA_DIAS * DIA_MS;
  const d = msDe(desde);
  return d === null ? limite : Math.max(d, limite);
}
