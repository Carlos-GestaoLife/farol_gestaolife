// Content script (mundo isolado): relay entre o MAIN world e o service worker.
//
// Fluxo de ida: MAIN world -> window.postMessage -> aqui (valida) -> chrome.runtime.sendMessage ->
// service worker. Fluxo de volta (Etapas 6 e 7): service worker -> chrome.tabs.sendMessage -> aqui
// (valida) -> window.postMessage -> MAIN world. Não conhece o wa-js. Tudo fora do namespace
// __PIOLHO__ ou fora do schema é ignorado em silêncio (regras em relay.ts).
//
// Modo descoberta (Etapa 5): lido de chrome.storage.local (piolho_descoberta) e repassado ao MAIN
// world ao carregar, quando muda e sempre que o MAIN world pede os padrões.
import { CHAVES_STORAGE } from "../shared/config";
import type { MensagemPonte } from "../shared/protocol";
import { daExtensaoParaPagina, daPaginaParaExtensao, mensagemDescoberta } from "./relay";

function enviarAoServiceWorker(msg: unknown): void {
  try {
    // Sem resposta esperada. Falha comum: extensão recarregada com a aba aberta
    // ("Extension context invalidated"); nesse caso a aba precisa ser recarregada.
    chrome.runtime.sendMessage(msg).catch(() => undefined);
  } catch {
    // chrome.runtime indisponível (contexto invalidado).
  }
}

function enviarAoMainWorld(msg: MensagemPonte): void {
  window.postMessage(msg, window.location.origin);
}

let descobertaAtual: unknown = false;

function publicarDescoberta(): void {
  enviarAoMainWorld(mensagemDescoberta(descobertaAtual));
}

window.addEventListener("message", (event: MessageEvent) => {
  const msg = daPaginaParaExtensao(event.source, window, event.data);
  if (msg === null) return;
  enviarAoServiceWorker(msg);
  // O MAIN world pede os padrões ao iniciar: aproveita e manda o modo descoberta.
  if (msg.tipo === "obter_padroes") publicarDescoberta();
});

chrome.runtime.onMessage.addListener((bruta: unknown, sender) => {
  // Só do service worker (mesma extensão e fora de uma aba).
  const msg = daExtensaoParaPagina(sender.id === chrome.runtime.id && !sender.tab, bruta);
  if (msg !== null) enviarAoMainWorld(msg);
  return false;
});

try {
  chrome.storage.local
    .get(CHAVES_STORAGE.descoberta)
    .then((dados) => {
      descobertaAtual = dados[CHAVES_STORAGE.descoberta] === true;
      publicarDescoberta();
    })
    .catch(() => undefined);
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area !== "local" || !(CHAVES_STORAGE.descoberta in mudancas)) return;
    descobertaAtual = mudancas[CHAVES_STORAGE.descoberta].newValue === true;
    publicarDescoberta();
  });
} catch {
  // chrome.storage indisponível (contexto invalidado).
}

console.debug("[PIOLHO] content script carregado");
