// Ponte do side panel com o service worker (chrome.runtime.sendMessage).
// O painel não fala com a aba do WhatsApp: o service worker guarda o último estado de cada aba,
// a fila e o estado do heartbeat. O token nunca passa por aqui.
import {
  montarMensagem,
  respostaObterEstadoSchema,
  statusPiolhoSchema,
  type RespostaObterEstado,
  type StatusPiolho,
} from "../shared/protocol";

/** Pede ao service worker o último estado do WhatsApp e o status. Lança se vier fora do schema. */
export async function obterEstado(): Promise<RespostaObterEstado> {
  const bruta: unknown = await chrome.runtime.sendMessage(montarMensagem("obter_estado", "painel", null));
  const r = respostaObterEstadoSchema.safeParse(bruta);
  if (!r.success) throw new Error("Resposta do service worker em formato inesperado.");
  return r.data;
}

function lerStatus(bruta: unknown): StatusPiolho {
  const r = statusPiolhoSchema.safeParse(bruta);
  if (!r.success) throw new Error("Resposta do service worker em formato inesperado.");
  return r.data;
}

/**
 * Avisa o service worker que a configuração mudou. Ele relê URL e token do chrome.storage.local,
 * manda um heartbeat e devolve o status atualizado.
 */
export async function avisarConfig(urlSistema: string): Promise<StatusPiolho> {
  return lerStatus(
    await chrome.runtime.sendMessage(montarMensagem("config", "painel", { url_sistema: urlSistema })),
  );
}

/** Botão "Enviar heartbeat agora". */
export async function heartbeatAgora(): Promise<StatusPiolho> {
  return lerStatus(await chrome.runtime.sendMessage(montarMensagem("heartbeat_agora", "painel", null)));
}
