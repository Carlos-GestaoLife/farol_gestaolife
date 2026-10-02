import { describe, expect, it } from "vitest";
import { formatarDataHora, formatarTelefone } from "./formatacao";

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
