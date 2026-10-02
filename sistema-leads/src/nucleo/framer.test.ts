import { describe, expect, it } from "vitest";
import { chaveSha256 } from "./entradas";
import { dataDoEnvio, extrairCamposFramer, interpretarCorpoFramer, normalizarNomeCampo } from "./framer";

describe("normalizarNomeCampo", () => {
  it("tira acento, põe em minúsculas e troca pontuação por _", () => {
    expect(normalizarNomeCampo("Nome Completo")).toBe("nome_completo");
    expect(normalizarNomeCampo("E-mail")).toBe("e_mail");
    expect(normalizarNomeCampo("  Ôrigem ")).toBe("origem");
    expect(normalizarNomeCampo("UTM Source")).toBe("utm_source");
  });
});

describe("extrairCamposFramer", () => {
  it("objeto plano com nomes em português, acentos e maiúsculas", () => {
    const c = extrairCamposFramer({
      "Nome Completo": "Maria Silva",
      "Telefone": "(62) 99999-0000",
      "E-mail": "Maria@Exemplo.com",
      "Cidade": "Maceió",
      utm_source: "instagram",
      utm_medium: "cpc",
      utm_campaign: "gnv-maceio",
      utm_content: "video1",
      utm_term: "gestao",
      Origem: "LP-GNV-MCZ",
      fbclid: "abc123",
      "Qual seu cargo?": "Dono",
    });
    expect(c).toMatchObject({
      nome: "Maria Silva",
      telefone: "(62) 99999-0000",
      email: "Maria@Exemplo.com",
      cidade: "Maceió",
      utm_source: "instagram",
      utm_medium: "cpc",
      utm_campaign: "gnv-maceio",
      utm_content: "video1",
      utm_term: "gestao",
      origem: "LP-GNV-MCZ",
      fbclid: "abc123",
    });
    expect(c.outros).toEqual({ "Qual seu cargo?": "Dono" });
  });

  it("sinônimos em inglês e aninhado em data/fields/formData/submission", () => {
    for (const chave of ["data", "fields", "formData", "submission"]) {
      const c = extrairCamposFramer({
        formId: "f1",
        [chave]: { name: "John", Phone: "+55 62 9 8888-7777", email: "j@x.com", city: "Goiânia", source_code: "X1" },
      });
      expect(c).toMatchObject({
        nome: "John",
        telefone: "+55 62 9 8888-7777",
        email: "j@x.com",
        cidade: "Goiânia",
        origem: "X1",
      });
      expect(c.outros).toEqual({ formId: "f1" });
    }
  });

  it("array de { name, value }, { field, value } e { label, value }", () => {
    const c = extrairCamposFramer({
      fields: [
        { name: "WhatsApp", value: "62988887777" },
        { field: "e-mail", value: "a@b.com" },
        { label: "Seu nome", value: "Ana" },
        { label: "Celular", value: "62911112222" },
        { name: "Mensagem", value: "Quero saber mais" },
      ],
    });
    // Vale o primeiro telefone encontrado (WhatsApp); o "Celular" repetido é ignorado.
    expect(c).toMatchObject({ nome: "Ana", telefone: "62988887777", email: "a@b.com" });
    expect(c.outros).toEqual({ Mensagem: "Quero saber mais" });
  });

  it("array na raiz, valores numéricos e campos vazios", () => {
    const c = extrairCamposFramer([
      { name: "tel", value: 62977776666 },
      { name: "nome", value: "   " },
      { name: "name", value: "Bia" },
    ]);
    expect(c).toMatchObject({ telefone: "62977776666", nome: "Bia", email: null, cidade: null });
  });

  it("guarda a data do envio quando vem no payload", () => {
    const c = extrairCamposFramer({ submittedAt: "2026-09-30T10:00:00Z", Nome: "Caio" });
    expect(c.enviado_em).toBe("2026-09-30T10:00:00Z");
    expect(c.outros).toEqual({});
  });
});

describe("interpretarCorpoFramer", () => {
  it("JSON", () => {
    expect(interpretarCorpoFramer('{"Nome":"Ana"}', "application/json")).toEqual({
      interpretado: true,
      corpo: { Nome: "Ana" },
    });
  });

  it("formulário urlencoded, com campo repetido", () => {
    const r = interpretarCorpoFramer(
      "Nome=Ana+Lima&Telefone=%2B5562999990000&tag=a&tag=b",
      "application/x-www-form-urlencoded; charset=utf-8",
    );
    expect(r).toEqual({
      interpretado: true,
      corpo: { Nome: "Ana Lima", Telefone: "+5562999990000", tag: ["a", "b"] },
    });
  });

  it("JSON sem content-type também é aceito", () => {
    expect(interpretarCorpoFramer('{"a":1}', null)).toEqual({ interpretado: true, corpo: { a: 1 } });
  });

  it("texto que não é JSON nem formulário vira { bruto }", () => {
    expect(interpretarCorpoFramer("isso não é nada", "text/plain")).toEqual({
      interpretado: false,
      corpo: { bruto: "isso não é nada" },
    });
    expect(interpretarCorpoFramer("{quebrado", "application/json")).toEqual({
      interpretado: false,
      corpo: { bruto: "{quebrado" },
    });
  });

  it("chave estável: mesmo corpo dá a mesma chave, corpos diferentes dão chaves diferentes", () => {
    const a = interpretarCorpoFramer('{"Nome":"Ana","Telefone":"62999990000"}', "application/json");
    const b = interpretarCorpoFramer('{ "Telefone": "62999990000", "Nome": "Ana" }', "application/json");
    const c = interpretarCorpoFramer('{"Nome":"Ana","Telefone":"62999990001"}', "application/json");
    expect(chaveSha256(a.corpo)).toBe(chaveSha256(b.corpo));
    expect(chaveSha256(a.corpo)).not.toBe(chaveSha256(c.corpo));
  });
});

describe("dataDoEnvio", () => {
  it("aceita ISO e timestamp em segundos ou milissegundos; descarta o absurdo", () => {
    expect(dataDoEnvio("2026-09-30T10:00:00Z")?.toISOString()).toBe("2026-09-30T10:00:00.000Z");
    expect(dataDoEnvio("1790000000")?.getTime()).toBe(1790000000 * 1000);
    expect(dataDoEnvio("1790000000000")?.getTime()).toBe(1790000000000);
    expect(dataDoEnvio("1999-01-01")).toBeNull();
    expect(dataDoEnvio("amanhã")).toBeNull();
    expect(dataDoEnvio(null)).toBeNull();
  });
});
