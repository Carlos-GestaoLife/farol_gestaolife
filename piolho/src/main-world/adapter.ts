// Único arquivo do piolho que fala com o wa-js (window.WPP). Roda no MAIN world.
//
// Regras (herdadas da extensão de referência, github.com/Carlos-GestaoLife/extrator_contatos):
// - Só leitura. Nada aqui envia mensagem, marca como lida ou entra em grupo.
// - window.WPP é lido de forma preguiçosa a cada chamada (função wpp()). Nunca guardar a referência
//   num const de módulo: o wa-js pode terminar de carregar depois.
// - APIs conferidas nos tipos do wa-js 4.6.0 (ver vendor/wa-js/VERSION.md) e já usadas na extensão
//   de referência. A interface WppMinimo descreve só o que usamos, com tipos frouxos onde o
//   WhatsApp pode variar. Antes de usar uma API nova, confirmar na versão vendorizada.
import { LIMITES, mensagemDeErro, type EstadoWhatsapp, type ItemMensagem } from "../shared/protocol";
import { classificarId, extrairDigitos, telefoneDeId } from "../shared/phone";
import { ehChatIndividual } from "../shared/phone";
import { JANELA_ABERTURA_SEG, type Abertura } from "./abertura";
import { idSerializado, montarItem, motivoParaIgnorar, type ContatoBruto, type MensagemBruta, type RegraTexto } from "./extracao";
import { resolverLid, type ContatoLike, type PnLidEntry, type WidLike } from "./lid";
import { instante, type ChatResumo, type HistoricoChat } from "./varredura";

// ---------------------------------------------------------------------------
// Interface mínima do wa-js
// ---------------------------------------------------------------------------

interface WppMinimo {
  isReady?: boolean;
  /** Emissor de eventos do wa-js (WPP.on / WPP.off). Ver docs/WA-JS.md. */
  on?: (evento: string, ouvinte: (...args: unknown[]) => void) => unknown;
  off?: (evento: string, ouvinte: (...args: unknown[]) => void) => unknown;
  loader?: { onReady?: (listener: () => void, delay?: number) => void };
  conn: {
    isAuthenticated(): boolean;
    isMainReady(): boolean;
    getMyUserId(): WidLike | undefined;
  };
  contact: {
    get(id: string | WidLike): Promise<ContatoLike | undefined>;
    getPnLidEntry(id: string | WidLike): Promise<PnLidEntry | undefined>;
  };
  whatsapp?: {
    functions?: { getPhoneNumber?: (wid: WidLike) => unknown };
  };
  /** WPP.chat (Etapas 6 e 7). Evidência em docs/WA-JS.md. */
  chat?: {
    list?: (opcoes?: { onlyUsers?: boolean; count?: number }) => Promise<ChatLike[]>;
    getMessages?: (
      chatId: string,
      opcoes?: { count?: number; direction?: "before" | "after"; id?: string },
    ) => Promise<MensagemBruta[]>;
  };
}

/** ChatModel do WhatsApp, forma frouxa: id (Wid) e `t` (última atividade, unix em segundos). */
interface ChatLike {
  id?: unknown;
  t?: unknown;
  timestamp?: unknown;
}

/** Lê window.WPP na hora. Nunca guardar o retorno em variável de módulo. */
function wpp(): WppMinimo | undefined {
  return (window as unknown as { WPP?: WppMinimo }).WPP;
}

function exigirWppPronto(): WppMinimo {
  const w = wpp();
  if (!w) throw new Error("wa-js não foi injetado");
  if (!w.isReady) throw new Error("O WhatsApp ainda não terminou de carregar.");
  return w;
}

// ---------------------------------------------------------------------------
// Etapa 1: prontidão, estado e número próprio
// ---------------------------------------------------------------------------

/** wa-js injetado e com os módulos do WhatsApp carregados (WPP.isReady). Nunca lança. */
export function estaPronto(): boolean {
  try {
    return !!wpp()?.isReady;
  } catch {
    return false;
  }
}

/**
 * Espera o wa-js ficar pronto. Usa WPP.loader.onReady quando existe e, por garantia, consulta
 * WPP.isReady a cada 500 ms. Resolve true quando pronto, ou false se passar do tempo limite.
 */
export function aguardarPronto(timeoutMs: number = 30_000): Promise<boolean> {
  if (estaPronto()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let encerrado = false;
    const concluir = (pronto: boolean) => {
      if (encerrado) return;
      encerrado = true;
      clearInterval(intervalo);
      clearTimeout(limite);
      resolve(pronto);
    };
    const intervalo = setInterval(() => {
      if (estaPronto()) concluir(true);
    }, 500);
    const limite = setTimeout(() => concluir(estaPronto()), timeoutMs);
    try {
      wpp()?.loader?.onReady?.(() => concluir(true));
    } catch {
      // Sem loader: fica só a consulta periódica.
    }
  });
}

/**
 * Número da conta logada na forma canônica (13 dígitos para celular brasileiro), ou null se o
 * WhatsApp ainda não sabe (antes do login) ou se o id próprio não for "@c.us".
 * API: WPP.conn.getMyUserId(), a mesma confirmada no adapter da extensão de referência.
 */
export function meuNumero(): string | null {
  try {
    const id = wpp()?.conn.getMyUserId()?._serialized;
    return typeof id === "string" ? extrairDigitos(id) : null;
  } catch {
    return null;
  }
}

/** Estado completo da aba para publicar na ponte. Síncrono e nunca lança. */
export function lerEstado(erro: string | null = null): EstadoWhatsapp {
  const w = wpp();
  if (!w) {
    return {
      wpp_pronto: false,
      autenticado: false,
      sincronizado: false,
      numero_proprio: null,
      erro: erro ?? "wa-js não foi injetado",
    };
  }
  try {
    const wppPronto = !!w.isReady;
    const autenticado = wppPronto && !!w.conn.isAuthenticated();
    const sincronizado = autenticado && !!w.conn.isMainReady();
    return {
      wpp_pronto: wppPronto,
      autenticado,
      sincronizado,
      numero_proprio: autenticado ? meuNumero() : null,
      erro: wppPronto ? null : erro,
    };
  } catch (err) {
    return {
      wpp_pronto: false,
      autenticado: false,
      sincronizado: false,
      numero_proprio: null,
      erro: mensagemDeErro(err).slice(0, LIMITES.mensagemErro),
    };
  }
}

// ---------------------------------------------------------------------------
// Resolução de telefone (usada pela extração)
// ---------------------------------------------------------------------------

/**
 * Telefone canônico de um contato "@lid", pela resolução best-effort de lid.ts; null se o
 * WhatsApp não expõe o número. Para "@c.us" devolve os dígitos do próprio id.
 */
export async function resolverTelefone(id: string): Promise<string | null> {
  const tipo = classificarId(id);
  if (tipo === "c.us") return telefoneDeId(id);
  if (tipo !== "lid") return null;
  const w = exigirWppPronto();
  let contato: ContatoLike | undefined;
  try {
    contato = (await w.contact.get(id)) ?? undefined;
  } catch {
    contato = undefined;
  }
  const { telefoneSerializado } = await resolverLid(
    {
      getPhoneNumber: (wid) => w.whatsapp?.functions?.getPhoneNumber?.(wid),
      getPnLidEntry: (lid) => w.contact.getPnLidEntry(lid),
    },
    { _serialized: id },
    contato,
  );
  return telefoneDeId(id, telefoneSerializado ?? null);
}

// ---------------------------------------------------------------------------
// Etapa 4: escuta ao vivo
// ---------------------------------------------------------------------------

/** Objeto de mensagem do WhatsApp (MsgModel), na forma frouxa usada por extracao.ts. */
export type MensagemWhatsapp = MensagemBruta;

/** Evento do wa-js 4.6.0 para mensagem nova (recebida ou enviada). Evidência em docs/WA-JS.md. */
export const EVENTO_MENSAGEM_NOVA = "chat.new_message";

/** Contato do chat pela store local (WPP.contact.get). Nunca lança. */
async function obterContato(id: string): Promise<ContatoBruto | undefined> {
  try {
    return ((await wpp()?.contact.get(id)) as ContatoBruto | undefined) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Opções da escuta ao vivo: padrões (texto_abertura) e modo descoberta, lidos a cada mensagem. */
export interface OpcoesEscuta {
  padroes(): readonly string[];
  descoberta(): boolean;
  /** Chamado com o objeto bruto quando o modo descoberta está ligado (descoberta.ts). */
  aoDescobrir(msg: unknown): void;
}

/**
 * Escuta mensagens novas de conversas individuais, recebidas e enviadas, e entrega cada uma já
 * convertida em ItemMensagem (extracao.montarItem aplica os filtros: grupos, status, canais,
 * listas de transmissão, notificações e chat próprio ficam de fora).
 *
 * Evento: WPP.on("chat.new_message"). No wa-js 4.6.0 ele é emitido a partir de
 * MsgStore.on("add") para toda mensagem com isNewMsg, sem filtrar fromMe; a doc do wa-js mostra
 * o uso com msg.fromMe para "enviei/recebi". Se dispara para as enviadas PELO CELULAR é
 * confirmação prática da Etapa 5 (docs/CTWA.md).
 * texto_abertura: regra (a) pelo histórico local (avaliarAberturaAoVivo) e (b) pelos padrões.
 * Precisa do WPP pronto. Devolve a função que cancela a escuta.
 */
export function aoReceberMensagem(cb: (item: ItemMensagem) => void, opcoes: OpcoesEscuta): () => void {
  const w = exigirWppPronto();
  if (typeof w.on !== "function") throw new Error("WPP.on indisponível nesta versão do wa-js.");
  const ouvinte = (...args: unknown[]) => {
    const msg = args[0] as MensagemBruta;
    if (opcoes.descoberta()) opcoes.aoDescobrir(msg);
    const regra: RegraTexto = {
      padroes: opcoes.padroes(),
      avaliarAbertura: (m) => avaliarAberturaAoVivo(m),
    };
    void montarItem(msg, meuNumero(), resolverTelefoneSeguro, obterContato, regra)
      .then((item) => {
        if (item) cb(item);
      })
      .catch((erro: unknown) => console.warn("[PIOLHO] falha ao montar item", mensagemDeErro(erro)));
  };
  w.on(EVENTO_MENSAGEM_NOVA, ouvinte);
  return () => {
    try {
      wpp()?.off?.(EVENTO_MENSAGEM_NOVA, ouvinte);
    } catch {
      // wa-js recarregado: nada a cancelar.
    }
  };
}

/** resolverTelefone que nunca lança (para a extração ao vivo). */
async function resolverTelefoneSeguro(id: string): Promise<string | null> {
  try {
    return await resolverTelefone(id);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Etapas 6 e 7: histórico do chat
// ---------------------------------------------------------------------------

/** Mensagens por página ao ler o histórico (WPP.chat.getMessages). */
const PAGINA_HISTORICO = 100;
/** Páginas consultadas para achar a mensagem anterior de uma mensagem ao vivo. */
const PAGINAS_ABERTURA = 3;

function exigirChat(): Required<NonNullable<WppMinimo["chat"]>> {
  const w = exigirWppPronto();
  const chat = w.chat;
  if (!chat || typeof chat.list !== "function" || typeof chat.getMessages !== "function") {
    throw new Error("WPP.chat.list/getMessages indisponíveis nesta versão do wa-js.");
  }
  return chat as Required<NonNullable<WppMinimo["chat"]>>;
}

function numeroOuNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Página de mensagens do chat; resposta fora do esperado vira lista vazia. */
async function pagina(
  chatId: string,
  opcoes: { count: number; direction?: "before" | "after"; id?: string },
): Promise<MensagemBruta[]> {
  const lote = await exigirChat().getMessages(chatId, opcoes);
  return Array.isArray(lote) ? lote.filter((m) => m && typeof m === "object") : [];
}

/** Mensagem de menor (ou maior) t de uma lista, com id. */
function extremo(lista: Iterable<MensagemBruta>, maior: boolean): { id: string; t: number } | null {
  let melhor: { id: string; t: number } | null = null;
  for (const m of lista) {
    const id = idSerializado(m.id);
    const t = instante(m);
    if (id === null || t === null) continue;
    if (melhor === null || (maior ? t > melhor.t : t < melhor.t)) melhor = { id, t };
  }
  return melhor;
}

/**
 * Regra (a) do texto_abertura ao vivo: procura no histórico local (WPP.chat.getMessages, direção
 * "before" a partir da própria mensagem) a mensagem anterior do chat, ignorando notificações.
 * - anterior com até 30 dias: "nao_abre"; anterior mais velha que 30 dias: "abre";
 * - nenhuma anterior e o histórico local acabou (página vazia): "abre";
 * - não deu para afirmar (páginas só com notificações recentes, falha): "nao_sei".
 * Se a página vazia significa mesmo "conversa nova" no WhatsApp real é item da Etapa 5 (docs/CTWA.md).
 */
export async function avaliarAberturaAoVivo(msg: MensagemBruta): Promise<Abertura> {
  try {
    const t = instante(msg);
    const idMsg = idSerializado(msg.id);
    const chatId = idSerializado(msg.from);
    if (t === null || idMsg === null || chatId === null) return "nao_sei";
    const meu = meuNumero();
    let ancora = idMsg;
    for (let i = 0; i < PAGINAS_ABERTURA; i++) {
      const lote = await pagina(chatId, { count: 20, direction: "before", id: ancora });
      if (lote.length === 0) return "abre";
      const validas = lote.filter((m) => {
        const tm = instante(m);
        return idSerializado(m.id) !== idMsg && tm !== null && tm <= t && motivoParaIgnorar(m, meu) === null;
      });
      const anterior = extremo(validas, true);
      if (anterior) return t - anterior.t > JANELA_ABERTURA_SEG ? "abre" : "nao_abre";
      const maisVelha = extremo(lote, false);
      if (maisVelha === null) return "nao_sei";
      // Só notificações e já passou da janela: nenhuma conversa nos 30 dias anteriores.
      if (t - maisVelha.t > JANELA_ABERTURA_SEG) return "abre";
      ancora = maisVelha.id;
    }
    return "nao_sei";
  } catch {
    return "nao_sei";
  }
}

/**
 * Conversas individuais (@c.us e @lid) com a última atividade (ChatModel.t), via
 * WPP.chat.list({ onlyUsers: true }) (sem `count`, o wa-js devolve todas). Grupos, status, canais
 * e listas de transmissão ficam de fora (filtro do wa-js por isUser e o nosso por sufixo).
 */
export async function listarChatsIndividuais(): Promise<ChatResumo[]> {
  const chats = await exigirChat().list({ onlyUsers: true });
  const saida: ChatResumo[] = [];
  for (const c of Array.isArray(chats) ? chats : []) {
    const chatId = idSerializado(c?.id);
    if (chatId === null || !ehChatIndividual(chatId)) continue;
    saida.push({ chatId, ultimaMensagemEm: numeroOuNull(c.t) ?? numeroOuNull(c.timestamp) });
  }
  return saida;
}

/**
 * Mensagens de um chat do mais recente até alcançar `desdeUnixSeg` (inclui a primeira mais velha
 * que ele, para a regra de abertura) ou `limite`. Paginação com WPP.chat.getMessages:
 * 1. sem `id`: a página mais recente (o wa-js ancora na última recebida, lastReceivedKey);
 * 2. direção "after" a partir da mais nova: mensagens depois da última recebida (respostas);
 * 3. direção "before" a partir da mais velha, até passar de `desde`, a página vir vazia (fim do
 *    histórico local) ou chegar ao limite.
 */
export async function carregarMensagensDesde(
  chatId: string,
  desdeUnixSeg: number,
  limite: number,
): Promise<HistoricoChat> {
  const porId = new Map<string, MensagemBruta>();
  const juntar = (lote: MensagemBruta[]): number => {
    let novas = 0;
    for (const m of lote) {
      const id = idSerializado(m.id);
      if (id !== null && !porId.has(id)) {
        porId.set(id, m);
        novas++;
      }
    }
    return novas;
  };

  juntar(await pagina(chatId, { count: PAGINA_HISTORICO }));
  // Mais novas que a última recebida.
  for (let i = 0; i < 20 && porId.size < limite; i++) {
    const maisNova = extremo(porId.values(), true);
    if (maisNova === null) break;
    if (juntar(await pagina(chatId, { count: PAGINA_HISTORICO, direction: "after", id: maisNova.id })) === 0) break;
  }
  // Mais velhas, até alcançar `desde`.
  let semMaisHistorico = false;
  while (porId.size < limite) {
    const maisVelha = extremo(porId.values(), false);
    if (maisVelha === null) {
      semMaisHistorico = true;
      break;
    }
    if (maisVelha.t < desdeUnixSeg) break;
    const lote = await pagina(chatId, { count: PAGINA_HISTORICO, direction: "before", id: maisVelha.id });
    if (lote.length === 0) {
      semMaisHistorico = true;
      break;
    }
    if (juntar(lote) === 0) break;
  }
  return { mensagens: [...porId.values()], semMaisHistorico };
}

/** montarItem com telefone e contato memorizados por chat (para a varredura). */
export function criarMontadorDeItens(): (msg: MensagemBruta, regra: RegraTexto) => Promise<ItemMensagem | null> {
  const telefones = new Map<string, Promise<string | null>>();
  const contatos = new Map<string, Promise<ContatoBruto | undefined>>();
  const telefone = (id: string) => {
    if (!telefones.has(id)) telefones.set(id, resolverTelefoneSeguro(id));
    return telefones.get(id) as Promise<string | null>;
  };
  const contato = (id: string) => {
    if (!contatos.has(id)) contatos.set(id, obterContato(id));
    return contatos.get(id) as Promise<ContatoBruto | undefined>;
  };
  return (msg, regra) => montarItem(msg, meuNumero(), telefone, contato, regra);
}
