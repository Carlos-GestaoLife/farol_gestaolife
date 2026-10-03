// Regras do relay do content script, separadas do index.ts para poderem ser testadas sem Chrome.
import { montarMensagem, validarMensagem, type MensagemPonte, type TipoMensagem } from "../shared/protocol";

/**
 * Tipos que o content script repassa do MAIN world para o service worker:
 * `estado` (Etapa 1), `mensagem_nova` (Etapa 4), `obter_padroes` (Etapa 6) e `varredura` só na
 * fase `progresso` (Etapa 7).
 */
export const TIPOS_PAGINA_PARA_SW = new Set<TipoMensagem>(["estado", "mensagem_nova", "obter_padroes", "varredura"]);

/**
 * Tipos que o content script repassa do service worker para o MAIN world: `padroes` (Etapa 6) e
 * `varredura` nas fases `pedido` e `cancelar` (Etapa 7).
 */
export const TIPOS_SW_PARA_PAGINA = new Set<TipoMensagem>(["padroes", "varredura"]);

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
  if (msg.tipo === "varredura" && msg.payload.fase !== "progresso") return null;
  // Remonta o envelope: o que sai daqui nunca é o objeto original da página.
  return validarMensagem(montarMensagem(msg.tipo, "content", msg.payload, msg.requestId));
}

/**
 * Decide o que fazer com uma mensagem vinda da extensão (chrome.runtime.onMessage).
 * Aceita só se: o remetente é a própria extensão fora de uma aba (o service worker), passa no
 * schema, foi montada pelo service worker e o tipo está liberado. Devolve a mensagem remontada com
 * origem "content" (a única que o MAIN world aceita), ou null.
 */
export function daExtensaoParaPagina(remetenteEhServiceWorker: boolean, dado: unknown): MensagemPonte | null {
  if (!remetenteEhServiceWorker) return null;
  const msg = validarMensagem(dado);
  if (msg === null || msg.origem !== "service_worker" || !TIPOS_SW_PARA_PAGINA.has(msg.tipo)) return null;
  if (msg.tipo === "varredura" && msg.payload.fase === "progresso") return null;
  return validarMensagem(montarMensagem(msg.tipo, "content", msg.payload, msg.requestId));
}

/** Aviso do modo descoberta para o MAIN world (o valor vem de chrome.storage.local). */
export function mensagemDescoberta(valor: unknown): MensagemPonte {
  return montarMensagem("descoberta", "content", { ativo: valor === true });
}
