// Resolução best-effort de "@lid" para telefone.
//
// Lógica copiada do adapter da extensão de referência (github.com/Carlos-GestaoLife/extrator_contatos,
// src/main-world/adapter.ts, função resolverLid). Aqui ela fica isolada e NÃO chama o wa-js:
// recebe as fontes (funções do WPP) prontas do adapter.ts, que continua sendo o único arquivo que
// fala com window.WPP. Isso também permite testar a ordem das tentativas sem o WhatsApp.
//
// Nenhuma das fontes consulta o servidor do WhatsApp: todas leem caches locais. Se nenhuma
// souber o número, o contato vai com telefone null (o servidor aceita; o wa_id @lid identifica).
// A Etapa 5 (descoberta) confirma na prática quanto disso funciona na versão atual do WhatsApp.

export interface WidLike {
  _serialized: string;
  user?: string;
  server?: string;
}

export interface ContatoLike {
  name?: unknown;
  pushname?: unknown;
  verifiedName?: unknown;
  isBusiness?: unknown;
  /** Presente em versões recentes do WhatsApp quando o id é @lid. Sem garantia de formato. */
  phoneNumber?: unknown;
}

export interface PnLidEntry {
  lid?: WidLike;
  phoneNumber?: WidLike;
  contact?: ContatoLike;
}

/** Fontes de dados para resolver um LID, fornecidas pelo adapter.ts. Todas opcionais. */
export interface FontesLid {
  /** WPP.whatsapp.functions.getPhoneNumber (cache interno LID -> telefone). */
  getPhoneNumber?: (wid: WidLike) => unknown;
  /** WPP.contact.getPnLidEntry (também só consulta cache local). */
  getPnLidEntry?: (id: string) => Promise<PnLidEntry | undefined>;
}

export interface ResultadoLid {
  /** Id serializado do telefone ("5562...@c.us") ou dígitos, quando encontrado. */
  telefoneSerializado?: string;
  /** Entrada completa do cache, quando veio de getPnLidEntry (traz nomes do contato). */
  entrada?: PnLidEntry;
}

/** Extrai o id serializado de um Wid, de uma string ou de um objeto parecido. */
export function serializado(v: unknown): string | undefined {
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "object" && v !== null) {
    const s = (v as { _serialized?: unknown })._serialized;
    if (typeof s === "string" && s.length > 0) return s;
  }
  return undefined;
}

/**
 * Tenta descobrir o telefone real de um contato @lid, em ordem:
 * (a) campo phoneNumber do próprio contato; (b) getPhoneNumber (cache interno);
 * (c) getPnLidEntry. Nunca lança.
 */
export async function resolverLid(
  fontes: FontesLid,
  wid: WidLike,
  contato: ContatoLike | undefined,
): Promise<ResultadoLid> {
  // (a) campo phoneNumber do próprio contato (versões recentes)
  const doContato = serializado(contato?.phoneNumber);
  if (doContato) return { telefoneSerializado: doContato };

  // (b) função interna do WhatsApp (cache LID -> telefone)
  try {
    const doCache = serializado(fontes.getPhoneNumber?.(wid));
    if (doCache) return { telefoneSerializado: doCache };
  } catch {
    // segue para (c)
  }

  // (c) getPnLidEntry
  try {
    const entrada = (await fontes.getPnLidEntry?.(wid._serialized)) ?? undefined;
    const telefoneSerializado = serializado(entrada?.phoneNumber);
    return telefoneSerializado ? { telefoneSerializado, entrada } : { entrada };
  } catch {
    return {};
  }
}
