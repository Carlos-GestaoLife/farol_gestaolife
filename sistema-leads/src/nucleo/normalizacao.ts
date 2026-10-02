// Normalização de identificadores e textos. Funções puras, sem acesso ao banco.
// Regras na seção "Normalização" do CLAUDE.md do sistema-leads.

const DDI_BRASIL = "55";

/**
 * Normaliza um telefone para a forma canônica: só dígitos, com DDI.
 *
 * - Aceita máscara ("+55 (62) 9 9999-9999") e o prefixo internacional "00".
 * - Com 10 ou 11 dígitos e sem indicação de DDI ("+" ou "00"), assume Brasil (55).
 * - Nono dígito: número brasileiro com 12 dígitos (55 + DDD + 8) cujo número local começa com
 *   6, 7, 8 ou 9 (celular antigo, como vem em IDs antigos do WhatsApp) ganha o 9 e fica com 13.
 *   Fixo (local começando com 2 a 5) fica com 12.
 * - Retorna null para o que não for plausível: letras, "@", menos de 10 ou mais de 15 dígitos,
 *   DDD inválido ou número brasileiro com tamanho ou primeiro dígito impossível.
 */
export function normalizarTelefone(entrada: string): string | null {
  if (typeof entrada !== "string") return null;
  const bruto = entrada.trim();
  if (bruto === "" || /[a-z@]/i.test(bruto)) return null;

  let digitos = bruto.replace(/\D/g, "");
  // "+" ou "00" na frente indicam que o número já vem com DDI.
  const temDdiExplicito = bruto.startsWith("+") || digitos.startsWith("00");
  // Zeros à esquerda: prefixo internacional "00" ou prefixo de longa distância nacional "0".
  digitos = digitos.replace(/^0+/, "");

  if (!temDdiExplicito && (digitos.length === 10 || digitos.length === 11)) {
    digitos = DDI_BRASIL + digitos;
  }

  if (digitos.length < 10 || digitos.length > 15) return null;

  if (digitos.startsWith(DDI_BRASIL)) {
    return normalizarBrasileiro(digitos);
  }
  return digitos;
}

/** `digitos` começa com 55. Aplica a regra do nono dígito e valida o formato brasileiro. */
function normalizarBrasileiro(digitos: string): string | null {
  const ddd = digitos.slice(2, 4);
  const local = digitos.slice(4);
  // DDDs brasileiros vão de 11 a 99 e nenhum tem zero.
  if (!/^[1-9][1-9]$/.test(ddd)) return null;

  if (local.length === 8) {
    const primeiro = local[0];
    if ("6789".includes(primeiro)) return DDI_BRASIL + ddd + "9" + local; // celular sem o nono dígito
    if ("2345".includes(primeiro)) return digitos; // fixo
    return null;
  }
  if (local.length === 9) {
    // Com 9 dígitos locais, só celular (começando com 9) é válido.
    return local[0] === "9" ? digitos : null;
  }
  return null;
}

/** E-mail em minúsculo e sem espaços. Retorna null se não tiver formato de e-mail. */
export function normalizarEmail(entrada: string): string | null {
  if (typeof entrada !== "string") return null;
  const email = entrada.trim().toLowerCase();
  if (email.length > 254) return null;
  // Formato simples: algo@dominio.tld, sem espaços e com um único "@".
  if (!/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(email)) return null;
  if (email.includes("..")) return null;
  return email;
}

const PADRAO_WA_ID = /^\d{5,20}@(c\.us|lid)$/;

/**
 * wa_id do WhatsApp guardado como veio (só sem espaços nas pontas). Aceita `...@c.us`
 * (derivável para telefone) e `...@lid` (identificador opaco). Outros formatos: null.
 */
export function normalizarWaId(waId: string): string | null {
  if (typeof waId !== "string") return null;
  const valor = waId.trim();
  return PADRAO_WA_ID.test(valor) ? valor : null;
}

/** Telefone canônico de um wa_id `@c.us`. Para `@lid` (ou inválido), null. */
export function telefoneDeWaId(waId: string): string | null {
  const valor = normalizarWaId(waId);
  if (!valor || !valor.endsWith("@c.us")) return null;
  return normalizarTelefone("+" + valor.slice(0, -"@c.us".length));
}

/**
 * Texto para casar padrão: minúsculo, sem acento, sem emoji, espaços colapsados e sem
 * espaços nas pontas. Pontuação comum é mantida.
 */
export function normalizarTexto(texto: string): string {
  if (typeof texto !== "string") return "";
  return (
    texto
      .toLowerCase()
      .normalize("NFD")
      // Acentos e outras marcas combinantes (inclui o "keycap" de emojis como 1️⃣).
      .replace(/\p{M}/gu, "")
      // Emojis e pictogramas.
      .replace(/\p{Extended_Pictographic}/gu, "")
      // Bandeiras (indicadores regionais) e tons de pele.
      .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu, "")
      // Seletores de variação e o "zero width joiner" que monta emojis compostos.
      .replace(/[︀-️‍]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Verdadeiro se o texto, normalizado, é igual ao padrão normalizado ou começa com ele. */
export function casaPadrao(texto: string, padrao: string): boolean {
  const p = normalizarTexto(padrao);
  if (p === "") return false;
  const t = normalizarTexto(texto);
  return t === p || t.startsWith(p);
}
