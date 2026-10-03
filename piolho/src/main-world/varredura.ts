// Varredura desde o checkpoint (Etapa 7). Roda no MAIN world, um chat por vez.
//
// checkpoint = o maior entre `desde` (checkpoint local do número ou ultimo_sync_servidor, calculado
// pelo service worker; null quando forçada) e agora menos 30 dias. Para cada chat individual com
// última mensagem depois do checkpoint: carrega as mensagens para trás até alcançar o checkpoint
// (ou o limite por chat), monta os itens com montarItem (o texto_abertura usa o próprio histórico
// carregado) e entrega cada item com t >= checkpoint em `aoItem` (vira `mensagem_nova`; a fila
// deduplica pela chave numero:wa_msg_id). Pausa curta entre chats. Cancelável entre chats.
// A varredura NÃO mexe no checkpoint: ele só avança com o aceite do servidor.
//
// As dependências do WhatsApp chegam por parâmetro (adapter.ts no MAIN world, dados falsos nos
// testes). selecionarChats e mensagensDoChat são puras.
import type { ItemMensagem, ProgressoVarredura } from "../shared/protocol";
import { ehChatIndividual } from "../shared/phone";
import { checkpointEfetivo } from "../shared/varredura";
import { avaliarAbertura, type Abertura } from "./abertura";
import { idSerializado, motivoParaIgnorar, type MensagemBruta, type RegraTexto } from "./extracao";

/** Mensagens carregadas por chat, no máximo. */
export const LIMITE_POR_CHAT = 2000;
/** Pausa entre um chat e outro (ms). */
export const PAUSA_ENTRE_CHATS_MS = 300;

export interface ChatResumo {
  chatId: string;
  /** Última atividade do chat (unix em segundos), ou null se o WhatsApp não informa. */
  ultimaMensagemEm: number | null;
}

export interface HistoricoChat {
  /** Mensagens carregadas, em qualquer ordem. */
  mensagens: MensagemBruta[];
  /** O histórico local acabou: não há mensagens mais antigas que as carregadas. */
  semMaisHistorico: boolean;
}

export interface DepsVarredura {
  listarChatsIndividuais(): Promise<ChatResumo[]>;
  carregarMensagensDesde(chatId: string, desdeUnixSeg: number, limite: number): Promise<HistoricoChat>;
  /** montarItem com o número próprio, telefone e contato do chat já resolvidos. */
  montarItem(msg: MensagemBruta, regra: RegraTexto): Promise<ItemMensagem | null>;
  meuNumero(): string | null;
  padroes(): readonly string[];
  pausa(ms: number): Promise<void>;
  agora(): number;
}

export interface OpcoesVarredura {
  /** Checkpoint do pedido (ISO) ou null (forçada: só o limite de 30 dias). */
  desde: string | null;
  aoItem(item: ItemMensagem): void;
  aoProgresso(p: ProgressoVarredura): void;
  /** Consultado entre chats: true interrompe a varredura. */
  cancelada(): boolean;
  limitePorChat?: number;
  pausaMs?: number;
}

/** t (unix em segundos) da mensagem, ou null. */
export function instante(msg: MensagemBruta): number | null {
  const n = typeof msg.t === "number" ? msg.t : typeof msg.t === "string" ? Number(msg.t) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Chats a varrer: só individuais (@c.us e @lid), com última atividade em ou depois do checkpoint
 * (chat sem data entra, por segurança), do mais recente para o mais antigo. Pura.
 */
export function selecionarChats(chats: ChatResumo[], checkpointSeg: number): ChatResumo[] {
  const vistos = new Set<string>();
  return chats
    .filter((c) => {
      if (!ehChatIndividual(c.chatId) || vistos.has(c.chatId)) return false;
      vistos.add(c.chatId);
      return c.ultimaMensagemEm === null || c.ultimaMensagemEm >= checkpointSeg;
    })
    .sort((a, b) => (b.ultimaMensagemEm ?? Infinity) - (a.ultimaMensagemEm ?? Infinity));
}

export interface MensagemComAbertura {
  msg: MensagemBruta;
  /** Abertura de conversa calculada pelo histórico carregado. */
  abertura: Abertura;
}

/**
 * Do histórico carregado de um chat, as mensagens a enviar (t >= checkpoint, sem notificações,
 * sem repetidas, em ordem cronológica), cada uma com a abertura calculada pela mensagem anterior
 * do próprio histórico (incluindo as anteriores ao checkpoint). Pura.
 */
export function mensagensDoChat(
  historico: HistoricoChat,
  checkpointSeg: number,
  meuNumero: string | null,
): MensagemComAbertura[] {
  const porId = new Map<string, { msg: MensagemBruta; t: number }>();
  for (const msg of historico.mensagens) {
    const id = idSerializado(msg?.id);
    const t = msg ? instante(msg) : null;
    if (id === null || t === null || motivoParaIgnorar(msg, meuNumero) !== null) continue;
    if (!porId.has(id)) porId.set(id, { msg, t });
  }
  const ordenadas = [...porId.values()].sort((a, b) => a.t - b.t);
  const saida: MensagemComAbertura[] = [];
  for (const [i, { msg, t }] of ordenadas.entries()) {
    if (t < checkpointSeg) continue;
    const anterior = i > 0 ? ordenadas[i - 1].t : null;
    // Sem anterior carregada: só prova a abertura se o histórico local acabou.
    saida.push({ msg, abertura: avaliarAbertura(t, anterior, anterior === null && historico.semMaisHistorico) });
  }
  return saida;
}

/** Roda a varredura. Nunca lança: falhas viram `erro` no progresso final. */
export async function varrer(deps: DepsVarredura, opcoes: OpcoesVarredura): Promise<ProgressoVarredura> {
  const cpMs = checkpointEfetivo(opcoes.desde, deps.agora());
  const cpSeg = Math.floor(cpMs / 1000);
  const progresso: ProgressoVarredura = {
    fase: "progresso",
    desde: new Date(cpMs).toISOString(),
    chats_total: 0,
    chats_processados: 0,
    itens_enfileirados: 0,
    chat_atual: null,
    concluida: false,
    cancelada: false,
    erro: null,
  };
  const publicar = () => opcoes.aoProgresso({ ...progresso });
  const limite = opcoes.limitePorChat ?? LIMITE_POR_CHAT;
  const pausaMs = opcoes.pausaMs ?? PAUSA_ENTRE_CHATS_MS;
  let falhasChat = 0;

  try {
    const chats = selecionarChats(await deps.listarChatsIndividuais(), cpSeg);
    progresso.chats_total = chats.length;
    publicar();
    for (const [i, chat] of chats.entries()) {
      if (opcoes.cancelada()) {
        progresso.cancelada = true;
        break;
      }
      if (i > 0 && pausaMs > 0) await deps.pausa(pausaMs);
      progresso.chat_atual = chat.chatId;
      publicar();
      try {
        const historico = await deps.carregarMensagensDesde(chat.chatId, cpSeg, limite);
        const padroes = deps.padroes();
        for (const { msg, abertura } of mensagensDoChat(historico, cpSeg, deps.meuNumero())) {
          const item = await deps.montarItem(msg, { padroes, avaliarAbertura: async () => abertura });
          if (item) {
            opcoes.aoItem(item);
            progresso.itens_enfileirados++;
          }
        }
      } catch (erro) {
        falhasChat++;
        console.warn("[PIOLHO] varredura: falha no chat", chat.chatId, erro);
      }
      progresso.chats_processados++;
      publicar();
    }
    progresso.chat_atual = null;
    if (!progresso.cancelada) progresso.concluida = true;
    if (falhasChat > 0) progresso.erro = `${falhasChat} chat(s) com falha ao carregar as mensagens.`;
  } catch (erro) {
    progresso.chat_atual = null;
    progresso.erro = (erro instanceof Error && erro.message ? erro.message : String(erro)).slice(0, 1000);
  }
  publicar();
  return { ...progresso };
}
