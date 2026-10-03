// Service worker do piolho.
//
// Etapa 1: abre o side panel ao clicar no ícone, guarda em memória o último `estado` de cada aba
// do WhatsApp, responde `obter_estado` para o painel e registra o alarm de 1 minuto.
// TODO Etapa 2: heartbeat. TODO Etapa 3: fila (fila.ts), envio em lote, reenvio e backoff.
import { ALARM_TICK, URL_WHATSAPP } from "../shared/config";
import {
  validarMensagem,
  type EstadoWhatsapp,
  type RespostaObterEstado,
} from "../shared/protocol";

// ---------------------------------------------------------------------------
// Side panel
// ---------------------------------------------------------------------------

function habilitarAberturaDoPainel(): void {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((erro: unknown) => console.error("[PIOLHO] falha ao configurar o side panel", erro));
}

// ---------------------------------------------------------------------------
// Estado por aba (só memória: o SW do MV3 dorme e perde isso; o MAIN world republica a cada 15 s)
// ---------------------------------------------------------------------------

interface EstadoDaAba {
  estado: EstadoWhatsapp;
  recebidoEm: number;
}

const estadosPorAba = new Map<number, EstadoDaAba>();

/** "https://web.whatsapp.com/" (URL_WHATSAPP sem o "*"). */
const ORIGEM_WHATSAPP = URL_WHATSAPP.replace(/\*$/, "");

/** Escolhe a aba mais relevante: autenticada primeiro, depois a atualizada mais recentemente. */
function respostaObterEstado(): RespostaObterEstado {
  let escolhida: [number, EstadoDaAba] | null = null;
  for (const par of estadosPorAba) {
    if (escolhida === null) {
      escolhida = par;
      continue;
    }
    const [, atual] = par;
    const [, melhor] = escolhida;
    if (atual.estado.autenticado !== melhor.estado.autenticado) {
      if (atual.estado.autenticado) escolhida = par;
    } else if (atual.recebidoEm > melhor.recebidoEm) {
      escolhida = par;
    }
  }
  if (escolhida === null) return { estado: null, aba_id: null, recebido_em: null };
  const [abaId, { estado, recebidoEm }] = escolhida;
  return { estado, aba_id: abaId, recebido_em: new Date(recebidoEm).toISOString() };
}

chrome.tabs.onRemoved.addListener((abaId) => {
  estadosPorAba.delete(abaId);
});

// ---------------------------------------------------------------------------
// Mensagens (content script e side panel)
// ---------------------------------------------------------------------------

/** Página da própria extensão (side panel, aberto na lateral ou numa aba). */
function ehPaginaDaExtensao(sender: chrome.runtime.MessageSender): boolean {
  return typeof sender.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));
}

/** Content script numa aba do WhatsApp Web. */
function ehAbaDoWhatsapp(sender: chrome.runtime.MessageSender): boolean {
  return typeof sender.tab?.id === "number" && typeof sender.url === "string" && sender.url.startsWith(ORIGEM_WHATSAPP);
}

chrome.runtime.onMessage.addListener((bruta: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const msg = validarMensagem(bruta);
  if (msg === null) return false;

  switch (msg.tipo) {
    case "estado": {
      // Só do content script de uma aba do WhatsApp Web.
      if (msg.origem !== "content" || !ehAbaDoWhatsapp(sender)) return false;
      estadosPorAba.set(sender.tab?.id as number, { estado: msg.payload, recebidoEm: Date.now() });
      return false;
    }
    case "obter_estado": {
      // Só do side panel (página da extensão).
      if (msg.origem !== "painel" || !ehPaginaDaExtensao(sender)) return false;
      sendResponse(respostaObterEstado());
      return false;
    }
    case "config":
      // TODO Etapa 2: reagir à configuração nova (mandar heartbeat na hora).
      return false;
    default:
      // TODO Etapa 4: `mensagem_nova` -> fila.enfileirar. TODO Etapa 7: `varredura`.
      return false;
  }
});

// ---------------------------------------------------------------------------
// Alarm de 1 minuto
// ---------------------------------------------------------------------------

async function garantirAlarm(): Promise<void> {
  const existente = await chrome.alarms.get(ALARM_TICK);
  // Recriar zera o relógio do alarm; só cria quando não existe.
  if (!existente) await chrome.alarms.create(ALARM_TICK, { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_TICK) return;
  // TODO Etapa 3: esvaziar a fila em lotes de até 100 e mandar o heartbeat (TODO Etapa 2),
  // só se a aba do WhatsApp estiver aberta e o WPP pronto.
});

habilitarAberturaDoPainel();
void garantirAlarm();

chrome.runtime.onInstalled.addListener(() => {
  habilitarAberturaDoPainel();
  void garantirAlarm();
});
