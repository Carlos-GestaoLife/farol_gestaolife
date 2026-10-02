import { describe, expect, it } from "vitest";
import { dispositivoEmAlerta, emHorarioComercial } from "./horario";

// Datas em UTC; Brasília é UTC-3 (sem horário de verão desde 2019).
describe("emHorarioComercial", () => {
  it("segunda a sexta, das 8h às 19h de Brasília", () => {
    expect(emHorarioComercial(new Date("2026-10-05T11:00:00Z"))).toBe(true); // seg 8h00
    expect(emHorarioComercial(new Date("2026-10-05T10:59:00Z"))).toBe(false); // seg 7h59
    expect(emHorarioComercial(new Date("2026-10-09T21:59:00Z"))).toBe(true); // sex 18h59
    expect(emHorarioComercial(new Date("2026-10-09T22:00:00Z"))).toBe(false); // sex 19h00
  });

  it("fim de semana nunca é horário comercial", () => {
    expect(emHorarioComercial(new Date("2026-10-03T15:00:00Z"))).toBe(false); // sáb 12h
    expect(emHorarioComercial(new Date("2026-10-04T15:00:00Z"))).toBe(false); // dom 12h
  });

  it("usa o dia de Brasília, não o de UTC", () => {
    // Sábado 01h UTC = sexta 22h em Brasília: fora do horário.
    expect(emHorarioComercial(new Date("2026-10-10T01:00:00Z"))).toBe(false);
    // Segunda 02h UTC = domingo 23h em Brasília.
    expect(emHorarioComercial(new Date("2026-10-05T02:00:00Z"))).toBe(false);
  });
});

describe("dispositivoEmAlerta", () => {
  const agora = new Date("2026-10-05T15:00:00Z"); // seg 12h

  it("alerta com mais de 15 min sem sinal em horário comercial", () => {
    const ultimo = new Date(agora.getTime() - 16 * 60_000);
    expect(dispositivoEmAlerta({ ativo: true, ultimoSinalEm: ultimo }, agora)).toBe(true);
  });

  it("sem alerta com sinal recente, fora do horário ou inativo", () => {
    const recente = new Date(agora.getTime() - 14 * 60_000);
    const antigo = new Date(agora.getTime() - 60 * 60_000);
    expect(dispositivoEmAlerta({ ativo: true, ultimoSinalEm: recente }, agora)).toBe(false);
    expect(
      dispositivoEmAlerta({ ativo: true, ultimoSinalEm: antigo }, new Date("2026-10-04T15:00:00Z")),
    ).toBe(false);
    expect(dispositivoEmAlerta({ ativo: false, ultimoSinalEm: antigo }, agora)).toBe(false);
  });

  it("nunca deu sinal conta como sem sinal", () => {
    expect(dispositivoEmAlerta({ ativo: true, ultimoSinalEm: null }, agora)).toBe(true);
  });
});
