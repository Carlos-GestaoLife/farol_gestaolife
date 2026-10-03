import { describe, expect, it } from "vitest";
import {
  aplicarNonoDigito,
  classificarId,
  ehChatIndividual,
  extrairDigitos,
  normalizarTelefone,
  telefoneDeId,
} from "../src/shared/phone";
import { resolverLid } from "../src/main-world/lid";

describe("classificarId", () => {
  it("classifica os tipos", () => {
    expect(classificarId("5562999998888@c.us")).toBe("c.us");
    expect(classificarId("123456789012345@lid")).toBe("lid");
    expect(classificarId("120363012345678901@g.us")).toBe("g.us");
    expect(classificarId("status@broadcast")).toBe("broadcast");
    expect(classificarId("1600000000@broadcast")).toBe("broadcast");
    expect(classificarId("120363000000000000@newsletter")).toBe("newsletter");
    expect(classificarId("5562999998888")).toBe("desconhecido");
  });

  it("só conversa individual passa", () => {
    expect(ehChatIndividual("5562999998888@c.us")).toBe(true);
    expect(ehChatIndividual("123456789012345@lid")).toBe(true);
    expect(ehChatIndividual("120363012345678901@g.us")).toBe(false);
    expect(ehChatIndividual("status@broadcast")).toBe(false);
    expect(ehChatIndividual("120363000000000000@newsletter")).toBe(false);
  });
});

describe("nono dígito", () => {
  it("acrescenta o 9 em celular antigo de 12 dígitos (local de 6 a 9)", () => {
    expect(aplicarNonoDigito("556299998888")).toBe("5562999998888");
    expect(aplicarNonoDigito("556288887777")).toBe("5562988887777");
    expect(aplicarNonoDigito("556277776666")).toBe("5562977776666");
    expect(aplicarNonoDigito("556266665555")).toBe("5562966665555");
  });

  it("mantém fixo, número já com 13 dígitos e estrangeiro", () => {
    expect(aplicarNonoDigito("556232345678")).toBe("556232345678");
    expect(aplicarNonoDigito("5562999998888")).toBe("5562999998888");
    expect(aplicarNonoDigito("12025550123")).toBe("12025550123");
  });

  it("vale nos dois formatos de id: com e sem o nono dígito", () => {
    expect(extrairDigitos("556299998888@c.us")).toBe("5562999998888");
    expect(extrairDigitos("5562999998888@c.us")).toBe("5562999998888");
    expect(extrairDigitos("556299998888:12@c.us")).toBe("5562999998888");
  });

  it("vale nos dois formatos de texto livre", () => {
    expect(normalizarTelefone("+55 (62) 9999-8888")).toBe("5562999998888");
    expect(normalizarTelefone("+55 (62) 99999-8888")).toBe("5562999998888");
    expect(normalizarTelefone("(62) 9999-8888")).toBe("5562999998888");
    expect(normalizarTelefone("(62) 99999-8888")).toBe("5562999998888");
    expect(normalizarTelefone("0055 62 99999-8888")).toBe("5562999998888");
  });

  it("não assume Brasil em id do WhatsApp (que sempre traz DDI)", () => {
    expect(extrairDigitos("12025550123@c.us")).toBe("12025550123");
    expect(normalizarTelefone("12025550123@c.us")).toBe("12025550123");
  });
});

describe("telefone inválido ou ausente", () => {
  it("rejeita tamanhos fora de 10 a 15 e letras", () => {
    expect(extrairDigitos("123456789@c.us")).toBeNull();
    expect(extrairDigitos("1234567890123456@c.us")).toBeNull();
    expect(normalizarTelefone("abc")).toBeNull();
    expect(normalizarTelefone("")).toBeNull();
    expect(normalizarTelefone(null)).toBeNull();
  });

  it("nunca trata LID como telefone, mesmo com 13 dígitos", () => {
    expect(extrairDigitos("5562999998888@lid")).toBeNull();
    expect(normalizarTelefone("5562999998888@lid")).toBeNull();
    expect(telefoneDeId("123456789012345@lid")).toBeNull();
    expect(telefoneDeId("123456789012345@lid", null)).toBeNull();
  });

  it("usa o telefone resolvido de um @lid, na forma canônica", () => {
    expect(telefoneDeId("123456789012345@lid", "556299998888@c.us")).toBe("5562999998888");
    expect(telefoneDeId("123456789012345@lid", "5562999998888")).toBe("5562999998888");
  });

  it("grupo nunca vira telefone", () => {
    expect(telefoneDeId("120363012345678901@g.us", "5562999998888")).toBeNull();
  });
});

describe("resolverLid (best-effort)", () => {
  const wid = { _serialized: "123456789012345@lid" };

  it("sem nenhuma fonte, devolve sem telefone", async () => {
    expect(await resolverLid({}, wid, undefined)).toEqual({});
  });

  it("caches vazios ou com erro: @lid fica sem telefone", async () => {
    const r = await resolverLid(
      {
        getPhoneNumber: () => {
          throw new Error("indisponível");
        },
        getPnLidEntry: async () => undefined,
      },
      wid,
      { pushname: "Maria" },
    );
    expect(r.telefoneSerializado).toBeUndefined();
    expect(telefoneDeId(wid._serialized, r.telefoneSerializado ?? null)).toBeNull();
  });

  it("segue a ordem: contato, cache interno, getPnLidEntry", async () => {
    const fontes = {
      getPhoneNumber: () => ({ _serialized: "556288887777@c.us" }),
      getPnLidEntry: async () => ({ phoneNumber: { _serialized: "556277776666@c.us" } }),
    };
    expect((await resolverLid(fontes, wid, { phoneNumber: "556299998888@c.us" })).telefoneSerializado).toBe(
      "556299998888@c.us",
    );
    expect((await resolverLid(fontes, wid, {})).telefoneSerializado).toBe("556288887777@c.us");
    expect(
      (await resolverLid({ getPnLidEntry: fontes.getPnLidEntry }, wid, {})).telefoneSerializado,
    ).toBe("556277776666@c.us");
  });
});
