import { describe, expect, it } from "vitest";
import {
  casaPadrao,
  normalizarEmail,
  normalizarTelefone,
  normalizarTexto,
  normalizarWaId,
  telefoneDeWaId,
} from "./normalizacao";

const CANONICO = "5562999999999";

describe("normalizarTelefone: nono dígito", () => {
  it("13 dígitos com o 9 e 12 dígitos sem o 9 dão a MESMA canônica", () => {
    expect(normalizarTelefone("5562999999999")).toBe(CANONICO);
    expect(normalizarTelefone("556299999999")).toBe(CANONICO);
  });

  it("sem DDI: 11 dígitos (com o 9) e 10 dígitos (sem o 9) dão a MESMA canônica", () => {
    expect(normalizarTelefone("62999999999")).toBe(CANONICO);
    expect(normalizarTelefone("6299999999")).toBe(CANONICO);
  });

  it("insere o 9 para local começando com 6, 7, 8 ou 9", () => {
    expect(normalizarTelefone("556261234567")).toBe("5562961234567");
    expect(normalizarTelefone("556271234567")).toBe("5562971234567");
    expect(normalizarTelefone("556281234567")).toBe("5562981234567");
    expect(normalizarTelefone("556291234567")).toBe("5562991234567");
  });

  it("fixo (local começando com 2 a 5) fica com 12 dígitos", () => {
    expect(normalizarTelefone("556232345678")).toBe("556232345678");
    expect(normalizarTelefone("6232345678")).toBe("556232345678");
    expect(normalizarTelefone("551155554444")).toBe("551155554444");
    expect(normalizarTelefone("556242345678")).toHaveLength(12);
  });

  it("aceita máscara", () => {
    expect(normalizarTelefone("+55 (62) 9 9999-9999")).toBe(CANONICO);
    expect(normalizarTelefone("(62) 99999-9999")).toBe(CANONICO);
    expect(normalizarTelefone("+55 62 9999-9999")).toBe(CANONICO);
    expect(normalizarTelefone("  62 3234-5678 ")).toBe("556232345678");
  });

  it("remove o prefixo internacional 00 e o zero de longa distância", () => {
    expect(normalizarTelefone("0055 62 99999-9999")).toBe(CANONICO);
    expect(normalizarTelefone("062999999999")).toBe(CANONICO);
  });

  it("DDD 55 sem DDI recebe o 55 do Brasil", () => {
    expect(normalizarTelefone("55999999999")).toBe("5555999999999");
  });

  it("mantém número estrangeiro com DDI explícito", () => {
    expect(normalizarTelefone("+1 202 555 0123")).toBe("12025550123");
    expect(normalizarTelefone("+351 912 345 678")).toBe("351912345678");
  });

  it("rejeita o que não é plausível", () => {
    expect(normalizarTelefone("")).toBeNull();
    expect(normalizarTelefone("123")).toBeNull();
    expect(normalizarTelefone("999999999")).toBeNull(); // 9 dígitos
    expect(normalizarTelefone("1234567890123456")).toBeNull(); // 16 dígitos
    expect(normalizarTelefone("550299999999")).toBeNull(); // DDD com zero
    expect(normalizarTelefone("556219999999")).toBeNull(); // local começando com 1
    expect(normalizarTelefone("5562899999999")).toBeNull(); // 9 dígitos locais sem começar com 9
    expect(normalizarTelefone("55629999999999")).toBeNull(); // brasileiro com 14 dígitos
  });

  it("rejeita e-mail, wa_id e texto", () => {
    expect(normalizarTelefone("maria5562999999999@gmail.com")).toBeNull();
    expect(normalizarTelefone("556299999999@c.us")).toBeNull();
    expect(normalizarTelefone("me liga amanhã")).toBeNull();
    expect(normalizarTelefone("tel 62999999999")).toBeNull();
  });
});

describe("wa_id", () => {
  it("guarda como veio e aceita @c.us e @lid", () => {
    expect(normalizarWaId(" 556299999999@c.us ")).toBe("556299999999@c.us");
    expect(normalizarWaId("123456789012345@lid")).toBe("123456789012345@lid");
    expect(normalizarWaId("556299999999@s.whatsapp.net")).toBeNull();
    expect(normalizarWaId("maria@c.us")).toBeNull();
    expect(normalizarWaId("")).toBeNull();
  });

  it("deriva o telefone canônico de @c.us, inclusive sem o nono dígito", () => {
    expect(telefoneDeWaId("556299999999@c.us")).toBe(CANONICO);
    expect(telefoneDeWaId("5562999999999@c.us")).toBe(CANONICO);
    expect(telefoneDeWaId("556232345678@c.us")).toBe("556232345678");
  });

  it("não deriva telefone de @lid", () => {
    expect(telefoneDeWaId("123456789012345@lid")).toBeNull();
    expect(telefoneDeWaId("qualquer coisa")).toBeNull();
  });
});

describe("normalizarEmail", () => {
  it("minúsculo e sem espaços nas pontas", () => {
    expect(normalizarEmail("  Maria.Silva@Gmail.COM ")).toBe("maria.silva@gmail.com");
    expect(normalizarEmail("joao+lp@empresa.com.br")).toBe("joao+lp@empresa.com.br");
  });

  it("null para formato inválido", () => {
    expect(normalizarEmail("")).toBeNull();
    expect(normalizarEmail("maria")).toBeNull();
    expect(normalizarEmail("maria@")).toBeNull();
    expect(normalizarEmail("maria@gmail")).toBeNull();
    expect(normalizarEmail("ma ria@gmail.com")).toBeNull();
    expect(normalizarEmail("a@@b.com")).toBeNull();
    expect(normalizarEmail("maria@gmail..com")).toBeNull();
    expect(normalizarEmail("62999999999")).toBeNull();
  });
});

describe("normalizarTexto e casaPadrao", () => {
  it("minúsculo, sem acento, sem emoji e com espaços colapsados", () => {
    expect(normalizarTexto("  Olá!   Quero saber do GESTÃO na Veia  ")).toBe(
      "ola! quero saber do gestao na veia",
    );
    expect(normalizarTexto("Oi 👋🏽 tudo bem? ❤️ 🇧🇷")).toBe("oi tudo bem?");
    expect(normalizarTexto("👨‍👩‍👧 Família")).toBe("familia");
    expect(normalizarTexto("Ação\tcoração\nmaçã")).toBe("acao coracao maca");
  });

  it("casa quando igual ou quando o texto começa com o padrão", () => {
    const padrao = "Olá! Quero saber do Gestão na Veia Maceió";
    expect(casaPadrao("olá! quero saber do gestão na veia maceió", padrao)).toBe(true);
    expect(casaPadrao("Olá!  Quero saber do Gestao na Veia Maceio 😀 pode me ajudar?", padrao)).toBe(
      true,
    );
    expect(casaPadrao("Oi, quero saber do Gestão na Veia Maceió", padrao)).toBe(false);
    expect(casaPadrao("Olá! Quero saber", padrao)).toBe(false);
  });

  it("padrão vazio nunca casa", () => {
    expect(casaPadrao("qualquer coisa", "")).toBe(false);
    expect(casaPadrao("qualquer coisa", " 😀 ")).toBe(false);
  });
});
