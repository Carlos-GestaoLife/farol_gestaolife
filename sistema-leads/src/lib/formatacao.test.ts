import { describe, expect, it } from "vitest";
import {
  chaveDia,
  formatarDataHora,
  formatarDia,
  formatarDuracao,
  formatarTelefone,
  formatarTempoRelativo,
} from "./formatacao";

describe("formatarTelefone", () => {
  it("formata celular, fixo e estrangeiro", () => {
    expect(formatarTelefone("5562999998888")).toBe("+55 62 99999-8888");
    expect(formatarTelefone("556233334444")).toBe("+55 62 3333-4444");
    expect(formatarTelefone("14155550100")).toBe("+14155550100");
  });
});

describe("formatarDataHora", () => {
  it("usa o horário de Brasília e trata vazio", () => {
    expect(formatarDataHora(new Date("2026-10-02T14:03:11Z"))).toBe("02/10/2026, 11:03");
    expect(formatarDataHora(null)).toBe("Nunca");
    expect(formatarDataHora("lixo", "-")).toBe("-");
  });
});

describe("formatarDuracao", () => {
  it("minutos, horas e dias em pt-BR", () => {
    expect(formatarDuracao(20_000)).toBe("menos de 1 min");
    expect(formatarDuracao(4 * 60_000 + 30_000)).toBe("4 min");
    expect(formatarDuracao(2 * 3_600_000)).toBe("2 h");
    expect(formatarDuracao(2 * 3_600_000 + 15 * 60_000)).toBe("2 h 15 min");
    expect(formatarDuracao(12 * 3_600_000 + 15 * 60_000)).toBe("12 h");
    expect(formatarDuracao(26 * 3_600_000)).toBe("1 dia");
    expect(formatarDuracao(3 * 86_400_000 + 1)).toBe("3 dias");
    expect(formatarDuracao(-5)).toBe("menos de 1 min");
  });
});

describe("formatarTempoRelativo", () => {
  const agora = new Date("2026-10-02T15:00:00Z");
  it("há X min, h e dias", () => {
    expect(formatarTempoRelativo(new Date("2026-10-02T14:59:30Z"), agora)).toBe("agora há pouco");
    expect(formatarTempoRelativo(new Date("2026-10-02T14:55:00Z"), agora)).toBe("há 5 min");
    expect(formatarTempoRelativo(new Date("2026-10-02T13:00:00Z"), agora)).toBe("há 2 h");
    expect(formatarTempoRelativo(new Date("2026-10-01T14:00:00Z"), agora)).toBe("há 1 dia");
    expect(formatarTempoRelativo("2026-09-29T15:00:00Z", agora)).toBe("há 3 dias");
  });
  it("futuro conta como agora; vazio e inválido devolvem o texto de vazio", () => {
    expect(formatarTempoRelativo(new Date("2026-10-02T16:00:00Z"), agora)).toBe("agora há pouco");
    expect(formatarTempoRelativo(null, agora)).toBe("");
    expect(formatarTempoRelativo("lixo", agora, "-")).toBe("-");
  });
});

describe("chaveDia e formatarDia", () => {
  it("agrupa pelo dia de Brasília", () => {
    // 02:30 UTC do dia 3 ainda é dia 2 em Brasília.
    expect(chaveDia(new Date("2026-10-03T02:30:00Z"))).toBe("2026-10-02");
    expect(chaveDia(new Date("2026-10-03T03:00:00Z"))).toBe("2026-10-03");
    expect(formatarDia("2026-10-02")).toMatch(/02\/10\/2026/);
  });
});
