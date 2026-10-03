// Conversão de uma mensagem do WhatsApp (MsgModel do wa-js) em ItemMensagem do contrato.
// Funções puras: não falam com window.WPP (as fontes de dados chegam por parâmetro). Testadas em
// tests/extracao.test.ts com objetos de mensagem falsos.
//
// Campos do MsgModel usados (evidência em docs/WA-JS.md):
// - id._serialized (wa_msg_id) e id.fromMe (direção; o wa-js usa `id.fromMe ? to : from` para o chat);
// - from / to (Wid com _serialized, ou string);
// - t (unix em segundos);
// - type (tipo da mensagem do WhatsApp);
// - notifyName (pushname de quem mandou, só nas recebidas).
// Só metadados: o corpo (`body`) NÃO é lido aqui. texto_abertura e ctwa ficam null nesta etapa.
import { LIMITES, type Contato, type ItemMensagem, type TipoMidia } from "../shared/protocol";
import { classificarId, ehChatIndividual, extrairDigitos } from "../shared/phone";

/** Forma mínima (e frouxa) de uma mensagem do WhatsApp. Tudo opcional: o WhatsApp pode variar. */
export interface MensagemBruta {
  id?: { _serialized?: unknown; fromMe?: unknown } | null;
  fromMe?: unknown;
  from?: unknown;
  to?: unknown;
  t?: unknown;
  type?: unknown;
  notifyName?: unknown;
  isNotification?: unknown;
  isStatusV3?: unknown;
  broadcast?: unknown;
}

/** Contato do chat (ContactModel do wa-js), forma frouxa. */
export interface ContatoBruto {
  name?: unknown;
  pushname?: unknown;
  formattedName?: unknown;
  isMyContact?: unknown;
}

/**
 * Tipos de mensagem de sistema/notificação que não são conversa e são ignorados.
 * "ciphertext" é a mensagem ainda não decifrada: o wa-js emite chat.new_message de novo quando o
 * tipo muda (ver docs/WA-JS.md), então a versão decifrada chega depois e é essa que vale.
 * "revoked" (apagada) NÃO está aqui: vira tipo_midia "outro".
 */
export const TIPOS_IGNORADOS = new Set([
  "e2e_notification",
  "notification",
  "notification_template",
  "gp2",
  "call_log",
  "protocol",
  "ciphertext",
  "broadcast_notification",
  "newsletter_notification",
]);

const MAPA_TIPOS: Record<string, TipoMidia> = {
  chat: "texto",
  ptt: "audio",
  audio: "audio",
  image: "imagem",
  video: "video",
  document: "documento",
  sticker: "figurinha",
  location: "localizacao",
  live_location: "localizacao",
  vcard: "contato",
  multi_vcard: "contato",
};

/** type do WhatsApp -> tipo_midia do contrato. Desconhecido (inclusive "revoked") -> "outro". */
export function mapearTipo(tipo: unknown): TipoMidia {
  return typeof tipo === "string" && Object.prototype.hasOwnProperty.call(MAPA_TIPOS, tipo)
    ? MAPA_TIPOS[tipo]
    : "outro";
}

/** Id serializado de um Wid, de uma string ou de um objeto com _serialized. */
export function idSerializado(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (v && typeof v === "object") {
    const s = (v as { _serialized?: unknown })._serialized;
    if (typeof s === "string" && s.length > 0) return s;
  }
  return null;
}

function texto(v: unknown, max: number = LIMITES.nome): string | null {
  if (typeof v !== "string") return null;
  const limpo = v.trim();
  return limpo ? limpo.slice(0, max) : null;
}

/** Mensagem enviada por esta conta? Usa id.fromMe (o mesmo que o wa-js usa); cai para fromMe. */
export function ehEnviada(msg: MensagemBruta): boolean {
  const doId = msg.id?.fromMe;
  if (typeof doId === "boolean") return doId;
  return msg.fromMe === true;
}

/** Por que a mensagem foi ignorada (ou null se é para enviar). Pura, para testes e logs. */
export function motivoParaIgnorar(msg: MensagemBruta, meuNumero: string | null): string | null {
  if (!msg || typeof msg !== "object") return "não é objeto";
  if (idSerializado(msg.id) === null) return "sem id";
  if (typeof msg.type === "string" && TIPOS_IGNORADOS.has(msg.type)) return `tipo ${msg.type}`;
  if (msg.isNotification === true) return "notificação";
  if (msg.isStatusV3 === true) return "status";
  const chatId = idSerializado(ehEnviada(msg) ? msg.to : msg.from);
  if (chatId === null) return "sem chat";
  if (!ehChatIndividual(chatId)) return `chat ${classificarId(chatId)}`;
  // Conversa consigo mesmo ("mensagem para mim"): não é lead.
  if (meuNumero !== null && extrairDigitos(chatId) === meuNumero) return "chat próprio";
  return null;
}

/** Unix em segundos -> ISO; null se inválido. */
export function isoDeUnix(t: unknown): string | null {
  const n = typeof t === "number" ? t : typeof t === "string" ? Number(t) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Nome salvo na agenda: só se o contato é da agenda (isMyContact) ou tem `name` explícito. */
export function nomeAgenda(contato: ContatoBruto | undefined): string | null {
  if (!contato) return null;
  const nome = texto(contato.name);
  if (nome) return nome;
  if (contato.isMyContact === true) return texto(contato.formattedName);
  return null;
}

/**
 * Monta o ItemMensagem de uma mensagem do WhatsApp, ou null se a mensagem deve ser ignorada
 * (grupo, status, canal, lista de transmissão, notificação, chat próprio, dados faltando).
 *
 * @param resolverTelefone telefone canônico do chat ("@c.us" direto; "@lid" best-effort).
 * @param obterContato contato do chat (WPP.contact.get), para nome da agenda e pushname.
 */
export async function montarItem(
  msg: MensagemBruta,
  meuNumero: string | null,
  resolverTelefone: (chatId: string) => Promise<string | null>,
  obterContato: (chatId: string) => Promise<ContatoBruto | undefined> = async () => undefined,
): Promise<ItemMensagem | null> {
  if (motivoParaIgnorar(msg, meuNumero) !== null) return null;
  const enviada = ehEnviada(msg);
  const waMsgId = idSerializado(msg.id) as string;
  const chatId = idSerializado(enviada ? msg.to : msg.from) as string;
  const enviadaEm = isoDeUnix(msg.t);
  if (enviadaEm === null) return null;
  if (waMsgId.length > LIMITES.waMsgId || chatId.length > LIMITES.chatId) return null;

  let telefone: string | null = null;
  try {
    telefone = await resolverTelefone(chatId);
  } catch {
    telefone = null;
  }
  let contatoBruto: ContatoBruto | undefined;
  try {
    contatoBruto = await obterContato(chatId);
  } catch {
    contatoBruto = undefined;
  }

  const contato: Contato = {
    wa_id: chatId,
    telefone: telefone && telefone.length <= LIMITES.telefone ? telefone : null,
    nome_agenda: nomeAgenda(contatoBruto),
    // pushname do contato; nas recebidas, o notifyName da própria mensagem também serve.
    pushname: texto(contatoBruto?.pushname) ?? (enviada ? null : texto(msg.notifyName)),
  };

  return {
    wa_msg_id: waMsgId,
    chat_id: chatId,
    direcao: enviada ? "out" : "in",
    enviada_em: enviadaEm,
    tipo_midia: mapearTipo(msg.type),
    contato,
    // TODO Etapa 6: regra do texto_abertura (abre conversa ou casa com padroes_texto, máx. 300).
    texto_abertura: null,
    // TODO Etapa 6: contexto do anúncio de clique para WhatsApp (campos confirmados na Etapa 5).
    ctwa: null,
  };
}
