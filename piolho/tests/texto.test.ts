// Mesmos casos de sistema-leads/src/nucleo/normalizacao.test.ts ("normalizarTexto e casaPadrao"):
// a regra do piolho tem de ser IGUAL à do servidor.
import { describe, expect, it } from "vitest";
import { casaAlgumPadrao, casaPadrao, cortarTexto, normalizarTexto } from "../src/shared/texto";

describe("normalizarTexto e casaPadrao (iguais ao servidor)", () => {
  it("minúsculo, sem acento, sem emoji e com espaços colapsados", () => {
    expect(normalizarTexto("  Olá!   Quero saber do GESTÃO na Veia  ")).toBe("ola! quero saber do gestao na veia");
    expect(normalizarTexto("Oi 👋🏽 tudo bem? ❤️ 🇧🇷")).toBe("oi tudo bem?");
    expect(normalizarTexto("👨‍👩‍👧 Família")).toBe("familia");
    expect(normalizarTexto("Ação\tcoração\nmaçã")).toBe("acao coracao maca");
  });

  it("casa quando igual ou quando o texto começa com o padrão", () => {
    const padrao = "Olá! Quero saber do Gestão na Veia Maceió";
    expect(casaPadrao("olá! quero saber do gestão na veia maceió", padrao)).toBe(true);
    expect(casaPadrao("Olá!  Quero saber do Gestao na Veia Maceio 😀 pode me ajudar?", padrao)).toBe(true);
    expect(casaPadrao("Oi, quero saber do Gestão na Veia Maceió", padrao)).toBe(false);
    expect(casaPadrao("Olá! Quero saber", padrao)).toBe(false);
  });

  it("padrão vazio nunca casa", () => {
    expect(casaPadrao("qualquer coisa", "")).toBe(false);
    expect(casaPadrao("qualquer coisa", " 😀 ")).toBe(false);
  });

  it("começa com, e não contém: o padrão no meio do texto não casa", () => {
    expect(casaPadrao("Olá! Quero saber do Gestão na Veia Maceió", "quero saber do gestao na veia")).toBe(false);
    expect(casaPadrao("Olá! Quero saber do Gestão na Veia Maceió", "ola! quero saber do gestao na veia")).toBe(true);
    expect(casaAlgumPadrao("oi", ["ola", "oi"])).toBe(true);
    expect(casaAlgumPadrao("oi", [])).toBe(false);
  });
});

describe("cortarTexto", () => {
  it("não mexe em texto curto", () => {
    expect(cortarTexto("Olá", 300)).toBe("Olá");
  });

  it("corta em 300 unidades sem partir emoji", () => {
    const texto = "a".repeat(299) + "😀" + "b";
    const cortado = cortarTexto(texto, 300);
    expect(cortado).toBe("a".repeat(299));
    expect(cortado.length).toBeLessThanOrEqual(300);
  });

  it("não parte emoji composto (família com ZWJ) nem bandeira", () => {
    const familia = "👨‍👩‍👧";
    const texto = "x".repeat(295) + familia + "fim";
    expect(cortarTexto(texto, 300)).toBe("x".repeat(295));
    const bandeira = "x".repeat(297) + "🇧🇷" + "y";
    expect(cortarTexto(bandeira, 300)).toBe("x".repeat(297));
    expect(cortarTexto("x".repeat(296) + "🇧🇷" + "y", 300)).toBe("x".repeat(296) + "🇧🇷");
  });
});
