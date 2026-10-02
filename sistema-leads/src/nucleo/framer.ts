// Formulários das LPs do Framer: interpretação do corpo e extração tolerante dos campos.
// Funções puras, sem acesso ao banco.
//
// O formato exato que o Framer envia precisa ser confirmado com um envio real (roteiro em
// docs/WEBHOOKS.md). Pela documentação do Framer, o webhook do formulário manda um JSON com os
// campos do formulário; por segurança o extrator aceita vários formatos:
// - objeto plano: { "Nome": "...", "Telefone": "...", "utm_source": "..." };
// - aninhado em `data`, `fields`, `formData` ou `submission`;
// - array de { name, value }, { field, value }, { label, value } ou { key, value }.
// Os nomes dos campos são comparados sem acento, em minúsculas e sem pontuação, com sinônimos.

/** Corpo do envio como foi interpretado. `interpretado: false` guarda o texto cru. */
export type CorpoFramer =
  | { interpretado: true; corpo: unknown }
  | { interpretado: false; corpo: { bruto: string } };

/**
 * Interpreta o corpo cru: JSON (application/json ou qualquer texto que seja JSON) ou
 * `application/x-www-form-urlencoded`. Se não der para interpretar, devolve `{ bruto }`, para
 * que a entrada seja gravada mesmo assim (regra "nada se perde") e vá para `erro`.
 */
export function interpretarCorpoFramer(texto: string, contentType: string | null): CorpoFramer {
  const tipo = (contentType ?? "").toLowerCase();
  const aparado = texto.trim();

  if (tipo.includes("application/x-www-form-urlencoded")) {
    return aparado === ""
      ? { interpretado: false, corpo: { bruto: texto } }
      : { interpretado: true, corpo: formularioParaObjeto(aparado) };
  }

  // JSON (inclusive sem content-type ou com outro tipo, desde que o texto seja JSON).
  if (aparado.startsWith("{") || aparado.startsWith("[")) {
    try {
      const corpo: unknown = JSON.parse(aparado);
      if (corpo && typeof corpo === "object") return { interpretado: true, corpo };
    } catch {
      // segue para os outros formatos
    }
  }

  // Sem content-type de formulário, mas com cara de "a=1&b=2".
  if (/^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(aparado)) {
    return { interpretado: true, corpo: formularioParaObjeto(aparado) };
  }

  return { interpretado: false, corpo: { bruto: texto } };
}

/** "a=1&b=2&b=3" vira { a: "1", b: ["2", "3"] }. */
function formularioParaObjeto(texto: string): Record<string, string | string[]> {
  const objeto: Record<string, string | string[]> = {};
  for (const [chave, valor] of new URLSearchParams(texto)) {
    const atual = objeto[chave];
    if (atual === undefined) objeto[chave] = valor;
    else objeto[chave] = Array.isArray(atual) ? [...atual, valor] : [atual, valor];
  }
  return objeto;
}

/** Nome de campo comparável: sem acento, minúsculo, pontuação e espaços viram "_". */
export function normalizarNomeCampo(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const SINONIMOS = {
  nome: ["nome", "name", "nome_completo", "full_name", "seu_nome"],
  telefone: ["telefone", "phone", "whatsapp", "celular", "tel", "phone_number", "seu_telefone", "seu_whatsapp"],
  email: ["email", "e_mail", "seu_email"],
  cidade: ["cidade", "city"],
  utm_source: ["utm_source"],
  utm_medium: ["utm_medium"],
  utm_campaign: ["utm_campaign"],
  utm_content: ["utm_content"],
  utm_term: ["utm_term"],
  origem: ["origem", "source_code"],
  fbclid: ["fbclid"],
  enviado_em: ["submitted_at", "submittedat", "submission_date", "created_at", "createdat", "timestamp", "date"],
} as const;

export type CampoFramer = keyof typeof SINONIMOS;

const CAMPO_POR_NOME = new Map<string, CampoFramer>(
  (Object.entries(SINONIMOS) as [CampoFramer, readonly string[]][]).flatMap(([campo, nomes]) =>
    nomes.map((n) => [n, campo] as [string, CampoFramer]),
  ),
);

/** Chaves que só embrulham os campos (o conteúdo delas é procurado também). */
const CONTEINERES = new Set(["data", "fields", "formdata", "form_data", "submission", "values"]);
/** Chaves que dão o nome do campo num item de array. */
const CHAVES_NOME = ["name", "field", "label", "key", "id"];

export type CamposFramer = Record<Exclude<CampoFramer, "enviado_em">, string | null> & {
  /** Data do envio que veio no payload (texto original), se veio. */
  enviado_em: string | null;
  /** Campos que não casaram com nenhum conhecido, para inspeção. */
  outros: Record<string, unknown>;
};

type Par = { nome: string; valor: unknown };

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** Valor de texto de um campo: string, número ou booleano; array vira o primeiro não vazio. */
function comoTexto(valor: unknown): string | null {
  if (typeof valor === "string") return valor.trim() || null;
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  if (Array.isArray(valor)) {
    for (const v of valor) {
      const t = comoTexto(v);
      if (t) return t;
    }
  }
  return null;
}

/** Item de array no formato { name|field|label|key|id, value }. */
function parDeItem(item: unknown): Par | null {
  if (!ehObjeto(item) || !("value" in item || "values" in item)) return null;
  for (const k of CHAVES_NOME) {
    const nome = item[k];
    if (typeof nome === "string" && nome.trim()) {
      return { nome, valor: "value" in item ? item.value : item.values };
    }
  }
  return null;
}

function coletarPares(no: unknown, pares: Par[], profundidade = 0): void {
  if (profundidade > 4) return;
  if (Array.isArray(no)) {
    for (const item of no) {
      const par = parDeItem(item);
      if (par) pares.push(par);
      else if (ehObjeto(item)) coletarPares(item, pares, profundidade + 1);
    }
    return;
  }
  if (!ehObjeto(no)) return;
  for (const [chave, valor] of Object.entries(no)) {
    if (CONTEINERES.has(normalizarNomeCampo(chave)) && (ehObjeto(valor) || Array.isArray(valor))) {
      coletarPares(valor, pares, profundidade + 1);
    } else {
      pares.push({ nome: chave, valor });
    }
  }
}

/**
 * Extrai os campos conhecidos de um envio do Framer, em qualquer dos formatos aceitos.
 * Para cada campo vale o primeiro valor não vazio encontrado. O que não casou vai em `outros`.
 */
export function extrairCamposFramer(corpo: unknown): CamposFramer {
  const pares: Par[] = [];
  coletarPares(corpo, pares);

  const campos: CamposFramer = {
    nome: null,
    telefone: null,
    email: null,
    cidade: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    origem: null,
    fbclid: null,
    enviado_em: null,
    outros: {},
  };

  for (const { nome, valor } of pares) {
    const campo = CAMPO_POR_NOME.get(normalizarNomeCampo(nome));
    if (!campo) {
      if (!(nome in campos.outros)) campos.outros[nome] = valor;
      continue;
    }
    if (campos[campo] === null) {
      campos[campo] = comoTexto(valor);
    }
  }
  return campos;
}

/** Data do envio vinda do payload, se for uma data plausível; senão null. */
export function dataDoEnvio(texto: string | null): Date | null {
  if (!texto) return null;
  const numero = Number(texto);
  // Timestamp numérico: segundos (10 dígitos) ou milissegundos (13 dígitos).
  const ms = Number.isFinite(numero) ? (numero < 1e12 ? numero * 1000 : numero) : Date.parse(texto);
  if (!Number.isFinite(ms)) return null;
  const data = new Date(ms);
  // Descarta datas absurdas (antes de 2020 ou mais de um dia no futuro).
  if (data.getTime() < Date.UTC(2020, 0, 1) || data.getTime() > Date.now() + 24 * 3600 * 1000) {
    return null;
  }
  return data;
}
