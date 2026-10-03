// Modo descoberta (Etapa 5): só para diagnóstico no WhatsApp real (roteiro em docs/CTWA.md).
//
// Ligado no painel (chrome.storage.local.piolho_descoberta = true), o content script avisa o MAIN
// world (mensagem `descoberta`) e cada mensagem nova é logada no console da aba do WhatsApp com o
// prefixo "[piolho descoberta]": primeiro um resumo com os campos que interessam (ctwaContext,
// contextInfo.externalAdReply, id.fromMe, self, isNewMsg, type, from, to, author, sender), depois o
// objeto bruto limpo. NADA disso vai para o servidor.
//
// Limpeza (função pura, testada em tests/descoberta.test.ts): sem `body`, sem legenda, sem
// mensagem citada, sem mídia e sem thumbnails em base64. Wid vira texto (_serialized). Funções,
// ciclos e profundidade acima de 4 são cortados.

export const PREFIXO_DESCOBERTA = "[piolho descoberta]";

/** Campos removidos em qualquer nível: conteúdo da mensagem e mídia. */
const CAMPOS_PROIBIDOS = new Set([
  "body",
  "caption",
  "quotedMsg",
  "quotedMsgObj",
  "mediaData",
  "mediaObject",
  "matchedText",
  "vcard",
  "vcardList",
  "pollName",
  "pollOptions",
  "text",
  "content",
  "comment",
  "footer",
  "header",
  "jpegThumbnail",
  "thumbnail",
  "thumbnailUrl",
  "thumbnailHQ",
  "thumbnailDirectPath",
  "thumbnailSha256",
  "thumbnailEncSha256",
  "mediaUrl",
  "deprecatedMms3Url",
  "directPath",
  "mediaKey",
  "filehash",
  "encFilehash",
]);

/** No nível de cima, título e descrição são da prévia de link da mensagem (conteúdo). */
const PROIBIDOS_NO_TOPO = new Set(["title", "description", "canonicalUrl", "richPreviewType"]);

const PROFUNDIDADE_MAX = 4;
const ITENS_MAX = 20;
const TEXTO_MAX = 300;
const RE_BASE64 = /^[A-Za-z0-9+/=\r\n_-]{120,}$/;

function ehWid(v: Record<string, unknown>): string | null {
  const s = v._serialized;
  return typeof s === "string" && ("server" in v || "user" in v || Object.keys(v).length <= 4) ? s : null;
}

function limparValor(v: unknown, nivel: number, vistos: WeakSet<object>): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") {
    if (RE_BASE64.test(v) || v.startsWith("data:")) return "[base64 removido]";
    return v.length > TEXTO_MAX ? `${v.slice(0, TEXTO_MAX)}... [cortado]` : v;
  }
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "function" || typeof v === "symbol") return undefined;
  if (typeof v !== "object") return undefined;
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return "[binário removido]";
  if (vistos.has(v)) return "[ciclo]";
  vistos.add(v);
  if (Array.isArray(v)) {
    if (nivel >= PROFUNDIDADE_MAX) return `[lista com ${v.length}]`;
    return v.slice(0, ITENS_MAX).map((x) => limparValor(x, nivel + 1, vistos));
  }
  const obj = v as Record<string, unknown>;
  const wid = ehWid(obj);
  if (wid !== null) return wid;
  if (nivel >= PROFUNDIDADE_MAX) return "[objeto]";
  const saida: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (CAMPOS_PROIBIDOS.has(k) || /thumbnail/i.test(k)) continue;
    if (nivel === 0 && PROIBIDOS_NO_TOPO.has(k)) continue;
    const limpo = limparValor(obj[k], nivel + 1, vistos);
    if (limpo !== undefined) saida[k] = limpo;
  }
  return saida;
}

/**
 * Atributos crus do modelo: `serialize()` do modelo do WhatsApp quando existe, senão
 * `attributes`; objeto simples vale como está.
 */
function atributos(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== "object") return {};
  const serializar = (msg as { serialize?: unknown }).serialize;
  if (typeof serializar === "function") {
    try {
      const s: unknown = serializar.call(msg);
      if (s && typeof s === "object") return s as Record<string, unknown>;
    } catch {
      // segue para attributes.
    }
  }
  const attrs = (msg as { attributes?: unknown }).attributes;
  return attrs && typeof attrs === "object" ? (attrs as Record<string, unknown>) : (msg as Record<string, unknown>);
}

/** Lê um campo pelo getter do modelo e, se não houver, pelos atributos. */
function campo(msg: unknown, nome: string): unknown {
  if (!msg || typeof msg !== "object") return undefined;
  try {
    const direto = (msg as Record<string, unknown>)[nome];
    if (direto !== undefined) return direto;
  } catch {
    // getter que lança: tenta os atributos.
  }
  return atributos(msg)[nome];
}

/** Objeto bruto da mensagem limpo para o console (sem conteúdo nem mídia). Pura. */
export function limparParaDescoberta(msg: unknown): Record<string, unknown> {
  return limparValor(atributos(msg), 0, new WeakSet()) as Record<string, unknown>;
}

/** Resumo com os campos que a descoberta procura. Pura. */
export function resumoDescoberta(msg: unknown): Record<string, unknown> {
  const vistos = new WeakSet<object>();
  const l = (v: unknown) => limparValor(v, 1, vistos);
  const id = campo(msg, "id") as { fromMe?: unknown; _serialized?: unknown } | undefined;
  const contextInfo = campo(msg, "contextInfo") as { externalAdReply?: unknown } | undefined;
  return {
    id: typeof id?._serialized === "string" ? id._serialized : null,
    "id.fromMe": id?.fromMe ?? null,
    type: l(campo(msg, "type")) ?? null,
    self: l(campo(msg, "self")) ?? null,
    isNewMsg: l(campo(msg, "isNewMsg")) ?? null,
    from: l(campo(msg, "from")) ?? null,
    to: l(campo(msg, "to")) ?? null,
    author: l(campo(msg, "author")) ?? null,
    sender: l(campo(msg, "sender")) ?? null,
    t: l(campo(msg, "t")) ?? null,
    ctwaContext: l(campo(msg, "ctwaContext")) ?? null,
    "contextInfo.externalAdReply": l(contextInfo?.externalAdReply) ?? null,
  };
}

/** Loga a mensagem no console (só com o modo descoberta ligado). Nunca lança. */
export function logarDescoberta(msg: unknown): void {
  try {
    console.log(PREFIXO_DESCOBERTA, "resumo", resumoDescoberta(msg));
    console.log(PREFIXO_DESCOBERTA, "objeto (sem body e sem mídia)", limparParaDescoberta(msg));
  } catch (erro) {
    console.warn(PREFIXO_DESCOBERTA, "não consegui logar a mensagem", erro);
  }
}
