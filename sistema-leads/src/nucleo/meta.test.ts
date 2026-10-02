import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assinaturaMetaValida,
  buscarLeadNaGraph,
  dataMeta,
  extrairCamposMeta,
  interpretarNotificacaoMeta,
  parseJsonComIdsGrandes,
  type FetchFn,
} from "./meta";

const assinar = (corpo: string, segredo: string) =>
  "sha256=" + createHmac("sha256", segredo).update(corpo, "utf8").digest("hex");

describe("assinaturaMetaValida", () => {
  const corpo = '{"object":"page","entry":[]}';
  it("aceita a assinatura certa e recusa a errada, a ausente e a malformada", () => {
    expect(assinaturaMetaValida(corpo, assinar(corpo, "s1"), "s1")).toBe(true);
    expect(assinaturaMetaValida(corpo, assinar(corpo, "s1").toUpperCase().replace("SHA256", "sha256"), "s1")).toBe(true);
    expect(assinaturaMetaValida(corpo, assinar(corpo, "s2"), "s1")).toBe(false);
    expect(assinaturaMetaValida(corpo + " ", assinar(corpo, "s1"), "s1")).toBe(false);
    expect(assinaturaMetaValida(corpo, null, "s1")).toBe(false);
    expect(assinaturaMetaValida(corpo, "sha256=abc", "s1")).toBe(false);
    expect(assinaturaMetaValida(corpo, assinar(corpo, "s1").replace("sha256=", "sha1="), "s1")).toBe(false);
  });
});

describe("interpretarNotificacaoMeta", () => {
  it("um item por change leadgen, ids numéricos grandes sem perder precisão", () => {
    const texto = `{"object":"page","entry":[{"id":"153125381133","time":1438292065,"changes":[
      {"field":"leadgen","value":{"leadgen_id":1234567890123456789,"page_id":123123123,"form_id":"555","ad_id":12312312312,"adgroup_id":1,"created_time":1440120384}},
      {"field":"feed","value":{"x":1}},
      {"field":"leadgen","value":{"leadgen_id":"98765","created_time":1440120385}}]}]}`;
    const r = interpretarNotificacaoMeta(texto);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ignorados).toBe(1);
    expect(r.leads).toHaveLength(2);
    expect(r.leads[0]).toMatchObject({
      leadgen_id: "1234567890123456789",
      page_id: "123123123",
      form_id: "555",
      ad_id: "12312312312",
      created_time: 1440120384,
      entry_id: "153125381133",
    });
    expect(r.leads[0].change).toMatchObject({ adgroup_id: "1" });
    expect(r.leads[1]).toMatchObject({ leadgen_id: "98765", form_id: null, ad_id: null });
  });

  it("corpo que não é JSON ou sem entry: erro", () => {
    expect(interpretarNotificacaoMeta("x").ok).toBe(false);
    expect(interpretarNotificacaoMeta('{"a":1}').ok).toBe(false);
  });

  it("parseJsonComIdsGrandes não mexe em texto nem em números que não são id", () => {
    expect(parseJsonComIdsGrandes('{"t":"\\"ad_id\\": 123","n":12345678901234567,"id":7}')).toEqual({
      t: '"ad_id": 123',
      n: 12345678901234567,
      id: "7",
    });
  });
});

describe("dataMeta", () => {
  it("segundos Unix e ISO com +0000", () => {
    expect(dataMeta(1440120384)?.toISOString()).toBe("2015-08-21T01:26:24.000Z");
    expect(dataMeta("2026-10-02T14:03:11+0000")?.toISOString()).toBe("2026-10-02T14:03:11.000Z");
    expect(dataMeta("xx")).toBeNull();
    expect(dataMeta(null)).toBeNull();
  });
});

describe("extrairCamposMeta", () => {
  it("casa sinônimos e guarda o resto em outros", () => {
    const r = extrairCamposMeta([
      { name: "full_name", values: ["Maria Meta"] },
      { name: "phone_number", values: ["+5562999990000"] },
      { name: "email", values: ["m@x.com"] },
      { name: "cidade", values: ["Goiânia"] },
      { name: "qual_seu_faturamento?", values: ["até 50 mil"] },
      { name: "interesses", values: ["a", "b"] },
      { name: "vazio", values: [] },
    ]);
    expect(r.campos).toEqual({
      nome: "Maria Meta",
      telefone: "+5562999990000",
      email: "m@x.com",
      cidade: "Goiânia",
    });
    expect(r.outros).toEqual({
      "qual_seu_faturamento?": "até 50 mil",
      interesses: ["a", "b"],
      vazio: null,
    });
    expect(extrairCamposMeta(undefined).campos.nome).toBeNull();
  });
});

describe("buscarLeadNaGraph", () => {
  const TOKEN = "token-secreto-de-teste-EAAB";
  const original = process.env.META_PAGE_ACCESS_TOKEN;
  beforeEach(() => {
    process.env.META_PAGE_ACCESS_TOKEN = TOKEN;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.META_PAGE_ACCESS_TOKEN;
    else process.env.META_PAGE_ACCESS_TOKEN = original;
  });

  it("chama a URL certa com o token no header e devolve o lead", async () => {
    let chamada: { url: string; init?: RequestInit } | undefined;
    const fetchFn: FetchFn = async (url, init) => {
      chamada = { url, init };
      return Response.json({ id: "123", form_id: "9", created_time: "2026-10-02T14:03:11+0000", field_data: [] });
    };
    const lead = await buscarLeadNaGraph("123", fetchFn);
    expect(lead).toMatchObject({ id: "123", form_id: "9" });
    expect(chamada?.url).toBe(
      "https://graph.facebook.com/v21.0/123?fields=field_data,ad_id,adset_id,campaign_id,form_id,created_time",
    );
    expect(chamada?.url).not.toContain(TOKEN);
    expect(new Headers(chamada?.init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("HTTP 400 vira erro com status e mensagem da Graph, sem o token", async () => {
    const fetchFn: FetchFn = async () =>
      Response.json(
        {
          error: {
            message: `Invalid OAuth access token - ${TOKEN}`,
            type: "OAuthException",
            code: 190,
            fbtrace_id: "Abc",
          },
        },
        { status: 400 },
      );
    const erro = await buscarLeadNaGraph("123", fetchFn).catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toContain("HTTP 400");
    expect((erro as Error).message).toContain("Invalid OAuth access token");
    expect((erro as Error).message).toContain("código 190");
    expect((erro as Error).message).not.toContain(TOKEN);
  });

  it("falha de rede e token ausente viram erro descritivo", async () => {
    await expect(
      buscarLeadNaGraph("123", async () => {
        throw new TypeError("fetch failed");
      }),
    ).rejects.toThrow(/Falha de rede.*fetch failed/);
    delete process.env.META_PAGE_ACCESS_TOKEN;
    await expect(buscarLeadNaGraph("123", async () => Response.json({}))).rejects.toThrow(
      /META_PAGE_ACCESS_TOKEN/,
    );
  });
});
