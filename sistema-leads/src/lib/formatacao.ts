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
