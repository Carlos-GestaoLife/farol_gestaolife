// Regras do relay do content script, separadas do index.ts para poderem ser testadas sem Chrome.
import { montarMensagem, validarMensagem, type MensagemPonte, type TipoMensagem } from "../shared/protocol";

/**
 * Tipos que o content script repassa do MAIN world para o service worker.
 * Etapa 1: só `estado`. TODO Etapa 4: `mensagem_nova`. TODO Etapa 7: `varredura` (progresso).
 */
export const TIPOS_PAGINA_PARA_SW = new Set<TipoMensagem>(["estado"]);

/**
 * Decide o que fazer com uma mensagem vinda da página (window.postMessage).
 * Aceita só se: veio da própria janela, está no namespace __PIOLHO__, passa no schema, foi montada
 * pelo MAIN world e o tipo está liberado. Devolve uma mensagem NOVA (origem "content", mesmo
 * requestId) montada só com os campos validados, ou null para descartar em silêncio.
 */
export function daPaginaParaExtensao(fonte: unknown, janela: unknown, dado: unknown): MensagemPonte | null {
  if (fonte !== janela) return null;
  const msg = validarMensagem(dado);
  if (msg === null || msg.origem !== "main" || !TIPOS_PAGINA_PARA_SW.has(msg.tipo)) return null;
  // Remonta o envelope: o que sai daqui nunca é o objeto original da página.
  return validarMensagem(montarMensagem(msg.tipo, "content", msg.payload, msg.requestId));
}
