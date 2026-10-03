// Service worker do piolho: dono da fila, do heartbeat e do envio ao Sistema de Leads.
//
// - Guarda o último `estado` de cada aba do WhatsApp (memória + chrome.storage.session).
// - Recebe `mensagem_nova` do content script, grava na fila (IndexedDB) e agenda o envio (2 s).
// - Alarm `piolho-tick` (1 min): heartbeat (se passou 1 min do último) e esvaziar a fila (se o
//   backoff permitir), só quando há uma aba do WhatsApp com WPP pronto e número conhecido.
// - Mensagem `config` do painel (ou mudança no chrome.storage.local): relê URL e token, limpa o
//   "token inválido" e o backoff, e manda um heartbeat na hora.
// - Responde ao painel: `obter_estado` (estado da aba + StatusPiolho) e `heartbeat_agora`.
// - Etapa 6: publica os `padroes` do heartbeat para as abas (chrome.tabs.sendMessage -> content
//   script -> MAIN world) depois de cada heartbeat e quando a aba pede (`obter_padroes`).
// - Etapa 7: coordena a varredura. Manda `varredura` fase `pedido` para a aba (automática depois do
//   primeiro heartbeat da aba, a cada 6 h, ou "Forçar varredura" do painel), guarda o progresso em
//   chrome.storage.session e expõe no `obter_estado`. Uma varredura por vez. O checkpoint continua
//   avançando só com os aceitos do servidor (envio.ts); a varredura não mexe nele.
import { lerToken, lerUrlSistema } from "../shared/armazenamento";
import { ALARM_TICK, BUILD_DEV, CHAVES_STORAGE, URL_WHATSAPP } from "../shared/config";
import {
  LIMITES,
  estadoVarreduraSchema,
  estadoWhatsappSchema,
  montarMensagem,
  validarMensagem,
  type EstadoVarredura,
  type EstadoWhatsapp,
  type MensagemPonte,
  type ProgressoVarredura,
  type RespostaObterEstado,
  type StatusPiolho,
} from "../shared/protocol";
import { INTERVALO_VARREDURA_AUTO_MS, VARREDURA_SEM_SINAL_MS, desdeDoPedido } from "../shared/varredura";
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
  let ultimosRejeitados: StatusPiolho["ultimos_rejeitados"] = [];
  try {
    const [p, r, lista] = await Promise.all([
      fila.tamanho(numero ?? undefined),
      fila.totalRejeitados(),
      fila.listarRejeitados(LIMITES.rejeitadosPainel),
    ]);
    pendentes = p;
    rejeitados = r;
    ultimosRejeitados = lista.map((x) => ({
      wa_msg_id: x.wa_msg_id.slice(0, LIMITES.waMsgId),
      motivo: x.motivo.slice(0, LIMITES.mensagemErro),
      rejeitado_em: new Date(x.rejeitado_em).toISOString(),
    }));
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
    padroes_texto: est.padroes_texto.slice(0, LIMITES.padroes).map((p) => p.slice(0, LIMITES.padrao)),
    ultimos_rejeitados: ultimosRejeitados,
    varredura: comInterrupcao(await lerVarredura()),
  };
}

// ---------------------------------------------------------------------------
// Tick (alarm), envio agendado e configuração
// ---------------------------------------------------------------------------

/**
 * Heartbeat e, se deu certo: publica os padrões para as abas e confere a varredura automática
 * (primeira depois de a aba ficar pronta, e de novo a cada 6 h).
 */
async function heartbeat(numero: string): Promise<void> {
  const r = await enviador.heartbeat(numero);
  if (r?.tipo !== "ok") return;
  await publicarPadroesParaAbas();
  await conferirVarreduraAutomatica(numero);
}

/** Heartbeat (se passou 1 min) e esvaziar a fila (se o backoff permitir). */
async function tick(opcoes: { ignorarBackoff?: boolean } = {}): Promise<void> {
  const numero = await numeroPronto();
  if (!numero) return;
  const est = await estadoExecucao.ler();
  const ultimo = est.ultimo_heartbeat_em ? Date.parse(est.ultimo_heartbeat_em) : 0;
  if (Date.now() - ultimo >= INTERVALO_HEARTBEAT_MS) await heartbeat(numero);
  await enviador.esvaziarFila(numero, opcoes);
}

// ---------------------------------------------------------------------------
// Ponte de volta para a aba (Etapas 6 e 7): service worker -> content script -> MAIN world
// ---------------------------------------------------------------------------

async function enviarParaAba(abaId: number, msg: MensagemPonte): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(abaId, msg);
    return true;
  } catch {
    // Aba fechada, recarregando ou sem content script (extensão recarregada).
    return false;
  }
}

async function publicarPadroes(abaId: number): Promise<void> {
  const { padroes_texto } = await estadoExecucao.ler();
  const lista = padroes_texto.slice(0, LIMITES.padroes).filter((p) => p.length <= LIMITES.padrao);
  await enviarParaAba(abaId, montarMensagem("padroes", "service_worker", { padroes_texto: lista }));
}

async function publicarPadroesParaAbas(): Promise<void> {
  await abasRestauradas;
  await Promise.all([...estadosPorAba.keys()].map((abaId) => publicarPadroes(abaId)));
}

// ---------------------------------------------------------------------------
// Varredura (Etapa 7)
// ---------------------------------------------------------------------------

const CHAVE_VARREDURA = "varredura";
/** Por aba: número para o qual a varredura automática de início já foi pedida. */
const CHAVE_VARREDURA_AUTO = "varredura_auto";

async function lerVarredura(): Promise<EstadoVarredura | null> {
  try {
    const dados = await chrome.storage.session.get(CHAVE_VARREDURA);
    const r = estadoVarreduraSchema.safeParse(dados[CHAVE_VARREDURA]);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

async function gravarVarredura(v: EstadoVarredura): Promise<void> {
  await chrome.storage.session.set({ [CHAVE_VARREDURA]: v }).catch(() => undefined);
}

/** Varredura "pedida" ou "rodando" sem notícia há mais de 2 min: interrompida. */
function comInterrupcao(v: EstadoVarredura | null, agora: number = Date.now()): EstadoVarredura | null {
  if (!v || (v.situacao !== "pedida" && v.situacao !== "rodando")) return v;
  if (agora - Date.parse(v.atualizada_em) <= VARREDURA_SEM_SINAL_MS) return v;
  return { ...v, situacao: "erro", chat_atual: null, erro: "Varredura interrompida: a aba do WhatsApp parou de responder." };
}

function emAndamento(v: EstadoVarredura | null): boolean {
  const atual = comInterrupcao(v);
  return !!atual && (atual.situacao === "pedida" || atual.situacao === "rodando");
}

async function lerAutoFeitas(): Promise<Record<string, string>> {
  try {
    const v: unknown = (await chrome.storage.session.get(CHAVE_VARREDURA_AUTO))[CHAVE_VARREDURA_AUTO];
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function marcarAuto(abaId: number, numero: string | null): Promise<void> {
  const mapa = await lerAutoFeitas();
  if (numero === null) delete mapa[String(abaId)];
  else mapa[String(abaId)] = numero;
  await chrome.storage.session.set({ [CHAVE_VARREDURA_AUTO]: mapa }).catch(() => undefined);
}

/** Aba pronta (WPP pronto e número conhecido) mais recente, com o número. */
async function abaPronta(): Promise<{ abaId: number; numero: string } | null> {
  await abasRestauradas;
  const agora = Date.now();
  let melhor: [number, EstadoDaAba] | null = null;
  for (const par of estadosPorAba) {
    if (abaEstaPronta(par[1], agora) && (melhor === null || par[1].recebidoEm > melhor[1].recebidoEm)) melhor = par;
  }
  return melhor ? { abaId: melhor[0], numero: melhor[1].estado.numero_proprio as string } : null;
}

/**
 * Pede a varredura à aba pronta. Normal: desde = maior entre checkpoint local e
 * ultimo_sync_servidor. Forçada: desde = null (o MAIN world usa só o limite de 30 dias).
 * Devolve null se pediu, ou o motivo de não ter pedido.
 */
async function pedirVarredura(forcada: boolean): Promise<string | null> {
  const aba = await abaPronta();
  if (!aba) return "Abra o WhatsApp Web e aguarde a conexão.";
  if (emAndamento(await lerVarredura())) return "Já existe uma varredura em andamento.";
  const est = await estadoExecucao.ler();
  const desde = desdeDoPedido(await lerCheckpoint(aba.numero), est.ultimo_sync_servidor, forcada);
  const agoraIso = new Date().toISOString();
  await gravarVarredura({
    aba_id: aba.abaId,
    situacao: "pedida",
    forcada,
    desde,
    iniciada_em: agoraIso,
    atualizada_em: agoraIso,
    chats_total: 0,
    chats_processados: 0,
    itens_enfileirados: 0,
    chat_atual: null,
    erro: null,
  });
  // Os padrões vão antes, para a regra do texto_abertura da varredura já usá-los.
  await publicarPadroes(aba.abaId);
  const ok = await enviarParaAba(aba.abaId, montarMensagem("varredura", "service_worker", { fase: "pedido", desde, forcada }));
  if (!ok) {
    await gravarVarredura({
      aba_id: aba.abaId,
      situacao: "erro",
      forcada,
      desde,
      iniciada_em: agoraIso,
      atualizada_em: new Date().toISOString(),
      chats_total: 0,
      chats_processados: 0,
      itens_enfileirados: 0,
      chat_atual: null,
      erro: "Não consegui falar com a aba do WhatsApp. Recarregue a aba.",
    });
    return "Não consegui falar com a aba do WhatsApp. Recarregue a aba.";
  }
  return null;
}

/** Depois de um heartbeat: varredura de início da aba (uma vez) e a cada 6 h. */
async function conferirVarreduraAutomatica(numero: string): Promise<void> {
  const aba = await abaPronta();
  if (!aba || aba.numero !== numero) return;
  const atual = comInterrupcao(await lerVarredura());
  if (emAndamento(atual)) return;
  const feitas = await lerAutoFeitas();
  if (feitas[String(aba.abaId)] !== numero) {
    await marcarAuto(aba.abaId, numero);
    const motivo = await pedirVarredura(false);
    if (motivo) console.warn("[PIOLHO] varredura de início não pedida:", motivo);
    return;
  }
  const ultima = atual?.situacao === "concluida" ? Date.parse(atual.atualizada_em) : null;
  if (ultima !== null && Date.now() - ultima >= INTERVALO_VARREDURA_AUTO_MS) {
    const motivo = await pedirVarredura(false);
    if (motivo) console.warn("[PIOLHO] varredura de 6 h não pedida:", motivo);
  }
}

/** Progresso vindo da aba. */
async function registrarProgresso(abaId: number, p: ProgressoVarredura): Promise<void> {
  const atual = await lerVarredura();
  const agoraIso = new Date().toISOString();
  const situacao: EstadoVarredura["situacao"] = p.cancelada
    ? "cancelada"
    : p.concluida
      ? "concluida"
      : p.erro
        ? "erro"
        : "rodando";
  const mesma = atual !== null && atual.aba_id === abaId;
  await gravarVarredura({
    aba_id: abaId,
    situacao,
    forcada: mesma ? atual.forcada : false,
    desde: p.desde,
    iniciada_em: mesma ? atual.iniciada_em : agoraIso,
    atualizada_em: agoraIso,
    chats_total: p.chats_total,
    chats_processados: p.chats_processados,
    itens_enfileirados: p.itens_enfileirados,
    chat_atual: p.chat_atual,
    erro: p.erro,
  });
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
        await heartbeat(numero);
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
      const payload = msg.payload;
      executar(
        (async () => {
          // Espera o estado restaurado: com o worker recém-acordado, "sem anterior" seria falso e
          // a varredura de início rodaria de novo à toa.
          await abasRestauradas;
          const anterior = estadosPorAba.get(abaId);
          const atual: EstadoDaAba = { estado: payload, recebidoEm: Date.now() };
          estadosPorAba.set(abaId, atual);
          persistirAbas();
          // Ficou pronta agora (ou trocou de conta): heartbeat e envio sem esperar o alarm.
          const ficouPronta =
            abaEstaPronta(atual) &&
            (!anterior ||
              !anterior.estado.wpp_pronto ||
              !anterior.estado.autenticado ||
              anterior.estado.numero_proprio !== atual.estado.numero_proprio);
          if (!ficouPronta) return;
          // Aba (re)carregada ou conta trocada: a varredura de início vale de novo para ela.
          await marcarAuto(abaId, null);
          await tick();
        })(),
        "estado da aba",
      );
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
        if (numero) await heartbeat(numero);
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
    case "obter_padroes": {
      if (msg.origem !== "content" || !ehAbaDoWhatsapp(sender)) return false;
      executar(publicarPadroes(sender.tab?.id as number), "publicar padrões");
      return false;
    }
    case "varredura": {
      const p = msg.payload;
      if (p.fase === "progresso") {
        if (msg.origem !== "content" || !ehAbaDoWhatsapp(sender)) return false;
        executar(registrarProgresso(sender.tab?.id as number, p), "progresso da varredura");
        return false;
      }
      if (msg.origem !== "painel" || !ehPaginaDaExtensao(sender)) return false;
      if (p.fase === "pedido") {
        // Botão "Forçar varredura": só o limite de 30 dias (ver README).
        return responderDepois(sendResponse, async () => {
          const motivo = await pedirVarredura(p.forcada);
          return { motivo, status: await montarStatus() };
        });
      }
      // Cancelar: repassa para a aba da varredura atual.
      return responderDepois(sendResponse, async () => {
        const atual = await lerVarredura();
        if (atual?.aba_id != null) {
          await enviarParaAba(atual.aba_id, montarMensagem("varredura", "service_worker", { fase: "cancelar" }));
        }
        return { motivo: null, status: await montarStatus() };
      });
    }
    default:
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
