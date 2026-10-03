// Ponte do side panel com o service worker (chrome.runtime.sendMessage).
// O painel não fala com a aba do WhatsApp: o service worker guarda o último estado de cada aba.
import { montarMensagem, respostaObterEstadoSchema, type RespostaObterEstado } from "../shared/protocol";

/** Pede ao service worker o último estado do WhatsApp. Lança se a resposta vier fora do schema. */
export async function obterEstado(): Promise<RespostaObterEstado> {
  const bruta: unknown = await chrome.runtime.sendMessage(montarMensagem("obter_estado", "painel", null));
  const r = respostaObterEstadoSchema.safeParse(bruta);
  if (!r.success) throw new Error("Resposta do service worker em formato inesperado.");
  return r.data;
}
