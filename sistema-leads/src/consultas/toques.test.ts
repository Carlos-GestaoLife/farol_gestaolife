import { describe, expect, it } from "vitest";
import { calcularToques, type EventoDeToque } from "./toques";

const MIN = 60_000;
const t0 = new Date("2026-09-01T12:00:00Z").getTime();

function ev(id: string, minutos: number, tipo: string, origem: string | null): EventoDeToque {
  return {
    id,
    tipo,
    canal: "whatsapp",
    ocorridoEm: new Date(t0 + minutos * MIN),
    registradoEm: new Date(t0 + minutos * MIN),
    origem: origem ? { id: origem, codigo: origem, nome: `Origem ${origem}`, tipo: "lp" } : null,
  };
}

describe("calcularToques", () => {
  it("sem eventos com origem: nenhum toque", () => {
    expect(calcularToques([])).toEqual({ primeiro: null, ultimo: null });
    expect(calcularToques([ev("a", 0, "conversa_iniciada", null)])).toEqual({
      primeiro: null,
      ultimo: null,
    });
  });

  it("sem venda: primeiro e último de todos (fora de ordem na entrada)", () => {
    const r = calcularToques([
      ev("c", 20, "form_enviado", "C"),
      ev("a", 0, "conversa_iniciada", "A"),
      ev("b", 10, "form_enviado", "B"),
    ]);
    expect(r.primeiro?.origem.id).toBe("A");
    expect(r.primeiro?.evento).toEqual({ id: "a", tipo: "conversa_iniciada", canal: "whatsapp" });
    expect(r.ultimo?.origem.id).toBe("C");
  });

  it("com venda: último toque é o último antes da primeira venda", () => {
    const r = calcularToques([
      ev("a", 0, "conversa_iniciada", "A"),
      ev("b", 10, "form_enviado", "B"),
      ev("v", 15, "venda_registrada", null),
      ev("c", 20, "form_enviado", "C"),
      ev("v2", 30, "venda_registrada", null),
    ]);
    expect(r.primeiro?.origem.id).toBe("A");
    expect(r.ultimo?.origem.id).toBe("B");
    expect(r.ultimo?.ocorridoEm.getTime()).toBe(t0 + 10 * MIN);
  });

  it("venda antes de qualquer toque: primeiro existe, último não", () => {
    const r = calcularToques([
      ev("v", 0, "venda_registrada", null),
      ev("a", 5, "form_enviado", "A"),
    ]);
    expect(r.primeiro?.origem.id).toBe("A");
    expect(r.ultimo).toBeNull();
  });
});
