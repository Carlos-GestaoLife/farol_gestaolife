import { describe, expect, it } from "vitest";
import { papelDe, podeAcessar } from "./papeis";

const SO_GESTAO = ["/origens", "/painel", "/saude", "/usuarios", "/dispositivos"];
const COMUNS = ["/", "/kanban", "/leads", "/pessoas"];

describe("podeAcessar", () => {
  it("comercial não acessa as rotas da gestão", () => {
    for (const rota of SO_GESTAO) {
      expect(podeAcessar("comercial", rota)).toBe(false);
    }
  });

  it("comercial não acessa subrotas nem rotas com query string da gestão", () => {
    expect(podeAcessar("comercial", "/usuarios/novo")).toBe(false);
    expect(podeAcessar("comercial", "/painel?periodo=30d")).toBe(false);
    expect(podeAcessar("comercial", "/saude/")).toBe(false);
    expect(podeAcessar("comercial", "/dispositivos?novo=1")).toBe(false);
  });

  it("gestão acessa tudo", () => {
    for (const rota of [...SO_GESTAO, ...COMUNS, "/usuarios/novo"]) {
      expect(podeAcessar("gestao", rota)).toBe(true);
    }
  });

  it("ambos acessam /, /kanban, /leads e /pessoas", () => {
    for (const rota of COMUNS) {
      expect(podeAcessar("comercial", rota)).toBe(true);
      expect(podeAcessar("gestao", rota)).toBe(true);
    }
    expect(podeAcessar("comercial", "/pessoas/123")).toBe(true);
  });

  it("não confunde prefixo parecido com rota da gestão", () => {
    expect(podeAcessar("comercial", "/painelzinho")).toBe(true);
    expect(podeAcessar("comercial", "/origens-publicas")).toBe(true);
  });
});

describe("papelDe", () => {
  it("só reconhece gestao; qualquer outro valor vira comercial", () => {
    expect(papelDe("gestao")).toBe("gestao");
    expect(papelDe("comercial")).toBe("comercial");
    expect(papelDe("admin")).toBe("comercial");
    expect(papelDe(undefined)).toBe("comercial");
  });
});
