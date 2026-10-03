// Service worker do piolho: dono da fila, do heartbeat e do envio ao Sistema de Leads.
//
// - Guarda o último `estado` de cada aba do WhatsApp (memória + chrome.storage.session).
// - Recebe `mensagem_nova` do content script, grava na fila (IndexedDB) e agenda o envio (2 s).
// - Alarm `piolho-tick` (1 min): heartbeat (se passou 1 min do último) e esvaziar a fila (se o
//   backoff permitir), só quando há uma aba do WhatsApp com WPP pronto e número conhecido.
// - Mensagem `config` do painel (ou mudança no chrome.storage.local): relê URL e token, limpa o
//   "token inválido" e o backoff, e manda um heartbeat na hora.
// - Responde ao painel: `obter_estado` (estado da aba + StatusPiolho) e `heartbeat_agora`.
// TODO Etapa 7: `varredura` (pedido ao MAIN world desde o checkpoint).
import { lerToken, lerUrlSistema } from "../shared/armazenamento";
import { ALARM_TICK, BUILD_DEV, CHAVES_STORAGE, URL_WHATSAPP } from "../shared/config";
import {
  estadoWhatsappSchema,
  validarMensagem,
  type EstadoWhatsapp,
  type RespostaObterEstado,
  type StatusPiolho,
} from "../shared/protocol";
import { enviarHeartbeat, enviarLote, type ConfigApi } from "./api";
import { avancarCheckpoint, lerCheckpoint } from "./checkpoint";
import { Enviador } from "./envio";
import { EstadoDeExecucao, armazenamentoChromeSession } from "./estado-execucao";
import { FilaIndexedDb } from "./fila";

/** Estado de aba mais velho que isso não conta (o MAIN world republica a cada 15 s). */
const VALIDADE_ESTADO_MS = 45_000;
/** Heartbeat no tick só se passou isso do último (o alarm é de 1 min, com folga para atraso). */
const INTERVALO_HEARTBEAT_MS = 50_000;
/** Espera depois de um item novo entrar na fila, para juntar vários num lote. */
const DEBOUNCE_ENVIO_MS = 2_000;

const fila = new FilaIndexedDb();
const estadoExecucao = new EstadoDeExecucao(armazenamentoChromeSession());

function versaoExtensao(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "0.0.0";
  }
}

async function lerConfig(): Promise<ConfigApi | null> {
  const [urlSistema, token] = await Promise.all([lerUrlSistema(), lerToken()]);
  return token ? { urlSistema, token } : null;
}

const enviador = new Enviador({
  fila,
  estado: estadoExecucao,
  lerConfig,
  enviarLote: (cfg, lote) => enviarLote(cfg, lote),
  enviarHeartbeat: (cfg, corpo) => enviarHeartbeat(cfg, corpo),
  lerCheckpoint,
  avancarCheckpoint,
  versaoExtensao: versaoExtensao(),
});

// ---------------------------------------------------------------------------
// Side panel
// ---------------------------------------------------------------------------

function habilitarAberturaDoPainel(): void {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((erro: unknown) => console.error("[PIOLHO] falha ao configurar o side panel", erro));
}

// ---------------------------------------------------------------------------
// Estado por aba (memória + chrome.storage.session, para sobreviver ao sono do worker)
// ---------------------------------------------------------------------------

interface EstadoDaAba {
  estado: EstadoWhatsapp;
  recebidoEm: number;
}

const estadosPorAba = new Map<number, EstadoDaAba>();
const CHAVE_ABAS = "abas";

const abasRestauradas: Promise<void> = (async () => {
  try {
    const dados = await chrome.storage.session.get(CHAVE_ABAS);
    const salvo: unknown = dados[CHAVE_ABAS];
    if (!salvo || typeof salvo !== "object") return;
    for (const [id, v] of Object.entries(salvo as Record<string, unknown>)) {
      const reg = v as { estado?: unknown; recebidoEm?: unknown };
      const estado = estadoWhatsappSchema.safeParse(reg?.estado);
      if (estado.success && typeof reg.recebidoEm === "number" && !estadosPorAba.has(Number(id))) {
        estadosPorAba.set(Number(id), { estado: estado.data, recebidoEm: reg.recebidoEm });
      }
    }
  } catch (erro) {
    console.warn("[PIOLHO] não consegui restaurar o estado das abas", erro);
  }
})();

function persistirAbas(): void {
  const obj: Record<string, EstadoDaAba> = {};
  for (const [id, v] of estadosPorAba) obj[String(id)] = v;
  chrome.storage.session.set({ [CHAVE_ABAS]: obj }).catch(() => undefined);
}

/** "https://web.whatsapp.com/" (URL_WHATSAPP sem o "*"). */
const ORIGEM_WHATSAPP = URL_WHATSAPP.replace(/\*$/, "");

/** Escolhe a aba mais relevante: autenticada primeiro, depois a atualizada mais recentemente. */
function escolherAba(): [number, EstadoDaAba] | null {
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
  return escolhida;
}

function abaEstaPronta(e: EstadoDaAba | undefined, agora: number = Date.now()): e is EstadoDaAba {
  return (
    !!e &&
    agora - e.recebidoEm <= VALIDADE_ESTADO_MS &&
    e.estado.wpp_pronto &&
    e.estado.autenticado &&
    e.estado.numero_proprio !== null
  );
}

/** Número da aba do WhatsApp com WPP pronto e número conhecido, ou null. */
async function numeroPronto(): Promise<string | null> {
  await abasRestauradas;
  const agora = Date.now();
  let melhor: EstadoDaAba | null = null;
  for (const e of estadosPorAba.values()) {
    if (abaEstaPronta(e, agora) && (melhor === null || e.recebidoEm > melhor.recebidoEm)) melhor = e;
  }
  return melhor?.estado.numero_proprio ?? null;
}

async function respostaObterEstado(): Promise<RespostaObterEstado> {
  await abasRestauradas;
  const status = await montarStatus();
  const escolhida = escolherAba();
  if (escolhida === null) return { estado: null, aba_id: null, recebido_em: null, status };
  const [abaId, { estado, recebidoEm }] = escolhida;
  return { estado, aba_id: abaId, recebido_em: new Date(recebidoEm).toISOString(), status };
}

chrome.tabs.onRemoved.addListener((abaId) => {
  if (estadosPorAba.delete(abaId)) persistirAbas();
});

// ---------------------------------------------------------------------------
// Status para o painel
// ---------------------------------------------------------------------------

async function montarStatus(): Promise<StatusPiolho> {
  const [urlSistema, token, est, numero] = await Promise.all([
    lerUrlSistema(),
    lerToken(),
    estadoExecucao.ler(),
    numeroPronto(),
  ]);
  let pendentes = 0;
  let rejeitados = 0;
  try {
    [pendentes, rejeitados] = await Promise.all([fila.tamanho(numero ?? undefined), fila.totalRejeitados()]);
  } catch (erro) {
    console.warn("[PIOLHO] não consegui ler a fila", erro);
  }
  return {
    configurado: token !== null,
    url_sistema: urlSistema,
    numero,
    token_invalido: est.token_invalido,
    ultimo_heartbeat_em: est.ultimo_heartbeat_em,
    ultimo_sync_servidor: est.ultimo_sync_servidor,
    qtd_padroes_texto: est.padroes_texto.length,
    pendentes,
    rejeitados,
    ultimo_envio: est.ultimo_envio,
    ultimo_erro: est.ultimo_erro,
    proximo_envio_em: est.proximo_envio_em,
    checkpoint: numero ? await lerCheckpoint(numero) : null,
  };
}

// ---------------------------------------------------------------------------
// Tick (alarm), envio agendado e configuração
// ---------------------------------------------------------------------------

/** Heartbeat (se passou 1 min) e esvaziar a fila (se o backoff permitir). */
async function tick(opcoes: { ignorarBackoff?: boolean } = {}): Promise<void> {
  const numero = await numeroPronto();
  if (!numero) return;
  const est = await estadoExecucao.ler();
  const ultimo = est.ultimo_heartbeat_em ? Date.parse(est.ultimo_heartbeat_em) : 0;
  if (Date.now() - ultimo >= INTERVALO_HEARTBEAT_MS) await enviador.heartbeat(numero);
  await enviador.esvaziarFila(numero, opcoes);
}

function executar(tarefa: Promise<unknown>, oQue: string): void {
  tarefa.catch((erro: unknown) => console.error(`[PIOLHO] falha em ${oQue}`, erro));
}

let temporizadorEnvio: ReturnType<typeof setTimeout> | null = null;

/** Item novo na fila: envia em 2 s (juntando o que chegar nesse meio tempo). */
function agendarEnvio(): void {
  if (temporizadorEnvio !== null) clearTimeout(temporizadorEnvio);
  temporizadorEnvio = setTimeout(() => {
    temporizadorEnvio = null;
    executar(
      (async () => {
        const numero = await numeroPronto();
        if (numero) await enviador.esvaziarFila(numero);
      })(),
      "envio agendado",
    );
  }, DEBOUNCE_ENVIO_MS);
}

let temporizadorConfig: ReturnType<typeof setTimeout> | null = null;
let aguardandoConfig: (() => void)[] = [];

/**
 * Configuração mudou (mensagem do painel ou chrome.storage.local): limpa "token inválido" e o
 * backoff, manda heartbeat e tenta esvaziar a fila. Agrupa avisos seguidos (300 ms); todas as
 * chamadas agrupadas resolvem quando a tarefa termina.
 */
function aoMudarConfig(): Promise<void> {
  return new Promise((resolve) => {
    aguardandoConfig.push(resolve);
    if (temporizadorConfig !== null) clearTimeout(temporizadorConfig);
    temporizadorConfig = setTimeout(() => {
      temporizadorConfig = null;
      const quemEspera = aguardandoConfig;
      aguardandoConfig = [];
      const tarefa = (async () => {
        await estadoExecucao.atualizar({
          token_invalido: false,
          ultimo_erro: null,
          proximo_envio_em: null,
          falhas_seguidas: 0,
          envio_em_andamento_desde: null,
        });
        const numero = await numeroPronto();
        if (!numero) return;
        await enviador.heartbeat(numero);
        await enviador.esvaziarFila(numero);
      })();
      executar(tarefa, "configuração nova");
      void tarefa.catch(() => undefined).finally(() => quemEspera.forEach((r) => r()));
    }, 300);
  });
}

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area !== "local") return;
  if (CHAVES_STORAGE.urlSistema in mudancas || CHAVES_STORAGE.token in mudancas) void aoMudarConfig();
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

/** Responde de forma assíncrona; em falha, responde null (o painel trata). */
function responderDepois(sendResponse: (r: unknown) => void, tarefa: () => Promise<unknown>): true {
  tarefa()
    .then((r) => sendResponse(r))
    .catch((erro: unknown) => {
      console.error("[PIOLHO] falha ao responder ao painel", erro);
      sendResponse(null);
    });
  return true;
}

chrome.runtime.onMessage.addListener((bruta: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const msg = validarMensagem(bruta);
  if (msg === null) return false;

  switch (msg.tipo) {
    case "estado": {
      // Só do content script de uma aba do WhatsApp Web.
      if (msg.origem !== "content" || !ehAbaDoWhatsapp(sender)) return false;
      const abaId = sender.tab?.id as number;
      const anterior = estadosPorAba.get(abaId);
      const atual: EstadoDaAba = { estado: msg.payload, recebidoEm: Date.now() };
      estadosPorAba.set(abaId, atual);
      persistirAbas();
      // Ficou pronta agora (ou trocou de conta): heartbeat e envio sem esperar o alarm.
      const ficouPronta =
        abaEstaPronta(atual) &&
        (!anterior ||
          !anterior.estado.wpp_pronto ||
          !anterior.estado.autenticado ||
          anterior.estado.numero_proprio !== atual.estado.numero_proprio);
      if (ficouPronta) executar(tick(), "início da aba");
      return false;
    }
    case "mensagem_nova": {
      if (msg.origem !== "content" || !ehAbaDoWhatsapp(sender)) return false;
      const { item, numero_monitorado } = msg.payload;
      executar(
        fila.enfileirar(numero_monitorado, [item]).then((novos) => {
          if (novos > 0) agendarEnvio();
        }),
        "enfileirar mensagem",
      );
      return false;
    }
    case "obter_estado": {
      if (msg.origem !== "painel" || !ehPaginaDaExtensao(sender)) return false;
      return responderDepois(sendResponse, respostaObterEstado);
    }
    case "config": {
      if (msg.origem !== "painel" || !ehPaginaDaExtensao(sender)) return false;
      return responderDepois(sendResponse, async () => {
        await aoMudarConfig();
        return montarStatus();
      });
    }
    case "heartbeat_agora": {
      if (msg.origem !== "painel" || !ehPaginaDaExtensao(sender)) return false;
      return responderDepois(sendResponse, async () => {
        const numero = await numeroPronto();
        if (numero) await enviador.heartbeat(numero);
        return montarStatus();
      });
    }
    case "tick_teste": {
      // Só no build de desenvolvimento (roteiro e2e): tick imediato, ignorando o backoff.
      if (!BUILD_DEV || msg.origem !== "painel" || !ehPaginaDaExtensao(sender)) return false;
      return responderDepois(sendResponse, async () => {
        await tick({ ignorarBackoff: true });
        return montarStatus();
      });
    }
    default:
      // TODO Etapa 7: `varredura`.
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
  executar(tick(), "tick do alarm");
});

habilitarAberturaDoPainel();
void garantirAlarm();

chrome.runtime.onInstalled.addListener(() => {
  habilitarAberturaDoPainel();
  void garantirAlarm();
});
