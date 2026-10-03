// Normalização de texto e casamento de padrão, IGUAIS às do servidor
// (sistema-leads/src/nucleo/normalizacao.ts: normalizarTexto e casaPadrao). Os dois projetos não
// compartilham código: se a regra mudar lá, mudar aqui também (os testes usam os mesmos casos).
//
// Usado pelo MAIN world na regra do texto_abertura (b): o texto da mensagem recebida casa com um
// dos padroes_texto do heartbeat. O servidor aplica a mesma regra de novo e descarta o que não
// cumprir; aqui ela serve para nunca mandar texto fora das condições.

/** Minúsculo, sem acento, sem emoji, com espaços colapsados e sem espaços nas pontas. */
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

/** Casa com algum dos padrões? */
export function casaAlgumPadrao(texto: string, padroes: readonly string[]): boolean {
  return padroes.some((p) => casaPadrao(texto, p));
}

/** Pedaços visíveis do texto (grafemas): um emoji composto conta como um só. */
function grafemas(texto: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (typeof Segmenter === "function") {
    return Array.from(new Segmenter("pt-BR", { granularity: "grapheme" }).segment(texto), (s) => s.segment);
  }
  // Sem Intl.Segmenter: ao menos não parte um par substituto (ponto de código).
  return Array.from(texto);
}

/**
 * Corta o texto para caber em `max` unidades de String.length (o limite que o zod aplica, aqui e
 * no servidor), sem partir emoji ao meio: corta só entre grafemas.
 */
export function cortarTexto(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  let saida = "";
  for (const g of grafemas(texto)) {
    if (saida.length + g.length > max) break;
    saida += g;
  }
  return saida;
}
