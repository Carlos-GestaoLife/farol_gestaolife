// Horário comercial e alerta de dispositivo sem sinal (tela Saúde). Funções puras.

const FUSO = "America/Sao_Paulo";

const PARTES = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO,
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
});

/** Minutos sem sinal a partir dos quais o dispositivo entra em alerta (em horário comercial). */
export const MINUTOS_ALERTA_SINAL = 15;

/**
 * Segunda a sexta, das 8h às 19h (19h exclusivo), no horário de Brasília (America/Sao_Paulo),
 * qualquer que seja o fuso do servidor.
 */
export function emHorarioComercial(data: Date): boolean {
  const partes = PARTES.formatToParts(data);
  const dia = partes.find((p) => p.type === "weekday")?.value;
  const hora = Number(partes.find((p) => p.type === "hour")?.value);
  if (!dia || dia === "Sat" || dia === "Sun") return false;
  return hora >= 8 && hora < 19;
}

/**
 * Alerta de dispositivo: ativo, último sinal há mais de 15 min (ou nunca) E agora é horário
 * comercial. Fora do horário comercial não há alerta (o PC pode estar desligado).
 */
export function dispositivoEmAlerta(
  dispositivo: { ativo: boolean; ultimoSinalEm: Date | null },
  agora: Date = new Date(),
): boolean {
  if (!dispositivo.ativo || !emHorarioComercial(agora)) return false;
  if (!dispositivo.ultimoSinalEm) return true;
  return agora.getTime() - dispositivo.ultimoSinalEm.getTime() > MINUTOS_ALERTA_SINAL * 60_000;
}
