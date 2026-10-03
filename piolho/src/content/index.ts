// Content script (mundo isolado): relay entre o MAIN world e o service worker.
//
// Fluxo: MAIN world -> window.postMessage -> aqui (valida) -> chrome.runtime.sendMessage ->
// service worker. Não conhece o wa-js. Tudo fora do namespace __PIOLHO__ ou fora do schema é
// ignorado em silêncio (regras em relay.ts).
import { daPaginaParaExtensao } from "./relay";

function enviarAoServiceWorker(msg: unknown): void {
  try {
    // Sem resposta esperada. Falha comum: extensão recarregada com a aba aberta
    // ("Extension context invalidated"); nesse caso a aba precisa ser recarregada.
    chrome.runtime.sendMessage(msg).catch(() => undefined);
  } catch {
    // chrome.runtime indisponível (contexto invalidado).
  }
}

window.addEventListener("message", (event: MessageEvent) => {
  const msg = daPaginaParaExtensao(event.source, window, event.data);
  if (msg !== null) enviarAoServiceWorker(msg);
});

// TODO Etapa 7: chrome.runtime.onMessage para repassar o pedido de varredura do service worker
// ao MAIN world (origem "service_worker" -> remontar com origem "content" -> window.postMessage).

console.debug("[PIOLHO] content script carregado");
