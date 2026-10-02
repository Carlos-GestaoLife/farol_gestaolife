// Formatação para exibição nas telas (pt-BR, horário de Brasília).

const FORMATO_DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/** "02/10/2026, 11:03" ou "Nunca" quando não há data. */
export function formatarDataHora(data: Date | string | null | undefined, vazio = "Nunca"): string {
  if (!data) return vazio;
  const d = data instanceof Date ? data : new Date(data);
  return Number.isNaN(d.getTime()) ? vazio : FORMATO_DATA_HORA.format(d);
}

/**
 * Telefone canônico para leitura: "+55 62 99999-9999" (celular), "+55 62 3333-4444" (fixo).
 * Outros formatos voltam só com o "+".
 */
export function formatarTelefone(numero: string): string {
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(numero);
  if (br) return `+55 ${br[1]} ${br[2]}-${br[3]}`;
  return /^\d+$/.test(numero) ? `+${numero}` : numero;
}

const MINUTO_MS = 60_000;
const HORA_MS = 60 * MINUTO_MS;
const DIA_MS = 24 * HORA_MS;

/**
 * Duração legível em pt-BR: "menos de 1 min", "4 min", "2 h", "2 h 15 min", "1 dia", "3 dias".
 * A partir de 1 dia mostra só os dias (arredondando para baixo).
 */
export function formatarDuracao(ms: number): string {
  const duracao = Math.max(0, ms);
  if (duracao < MINUTO_MS) return "menos de 1 min";
  if (duracao < HORA_MS) return `${Math.floor(duracao / MINUTO_MS)} min`;
  if (duracao < DIA_MS) {
    const horas = Math.floor(duracao / HORA_MS);
    const minutos = Math.floor((duracao % HORA_MS) / MINUTO_MS);
    return minutos > 0 && horas < 10 ? `${horas} h ${minutos} min` : `${horas} h`;
  }
  const dias = Math.floor(duracao / DIA_MS);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

/**
 * Tempo relativo ao passado em pt-BR: "agora há pouco" (menos de 1 min), "há 5 min", "há 2 h",
 * "há 1 dia", "há 3 dias". Datas no futuro (relógios fora de sincronia) contam como agora.
 * Sem data, devolve `vazio`.
 */
export function formatarTempoRelativo(
  data: Date | string | null | undefined,
  agora: Date = new Date(),
  vazio = "",
): string {
  if (!data) return vazio;
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return vazio;
  const diferenca = agora.getTime() - d.getTime();
  if (diferenca < MINUTO_MS) return "agora há pouco";
  if (diferenca < HORA_MS) return `há ${Math.floor(diferenca / MINUTO_MS)} min`;
  if (diferenca < DIA_MS) return `há ${Math.floor(diferenca / HORA_MS)} h`;
  const dias = Math.floor(diferenca / DIA_MS);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

const FORMATO_DIA = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

const FORMATO_CHAVE_DIA = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** Dia no horário de Brasília no formato "AAAA-MM-DD" (chave para agrupar por dia). */
export function chaveDia(data: Date): string {
  return FORMATO_CHAVE_DIA.format(data);
}

/** "sex., 02/10/2026" a partir de uma chave "AAAA-MM-DD" (meio-dia de Brasília, sem risco de virar o dia). */
export function formatarDia(chave: string): string {
  const d = new Date(`${chave}T12:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? chave : FORMATO_DIA.format(d);
}

/** "02/10/2026" (só a data, horário de Brasília) ou `vazio`. */
export function formatarData(data: Date | string | null | undefined, vazio = ""): string {
  if (!data) return vazio;
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return vazio;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(d);
}
