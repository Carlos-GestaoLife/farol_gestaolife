import { describe, expect, it } from "vitest";
import { colunasDaOrigem, montarLinkWhatsapp, origemFormSchema } from "./origens";

const base = { codigo: "gnv-maceio-2026", nome: "GNV Maceió", tipo: "link_whatsapp" };

describe("origemFormSchema", () => {
  it("código é minúsculo e sem espaços; padrão é salvo normalizado", () => {
    const r = origemFormSchema.parse({
      ...base,
      codigo: "  GNV-Maceio-2026 ",
      texto_preenchido: "  Olá! Quero saber do Gestão na Veia 🚀 Maceió ",
      meta_ad_id: "120210000",
      utm_source: " instagram ",
      ativo: "on",
    });
    expect(r.codigo).toBe("gnv-maceio-2026");
    const c = colunasDaOrigem(r);
    expect(c.padraoTexto).toBe("ola! quero saber do gestao na veia maceio");
    expect(c).toMatchObject({
      metaAdId: "120210000",
      utmSource: "instagram",
      utmMedium: null,
      ativo: true,
    });
  });

  it("rejeita código com espaço ou acento, id da Meta com letras e tipo inválido", () => {
    expect(origemFormSchema.safeParse({ ...base, codigo: "gnv maceio" }).success).toBe(false);
    expect(origemFormSchema.safeParse({ ...base, codigo: "maceió" }).success).toBe(false);
    expect(origemFormSchema.safeParse({ ...base, meta_form_id: "abc" }).success).toBe(false);
    expect(origemFormSchema.safeParse({ ...base, tipo: "outro" }).success).toBe(false);
    expect(origemFormSchema.safeParse({ ...base, nome: " " }).success).toBe(false);
  });

  it("texto só com emoji vira sem padrão; checkbox ausente é inativa", () => {
    const r = origemFormSchema.parse({ ...base, texto_preenchido: "🚀 " });
    expect(colunasDaOrigem(r)).toMatchObject({ padraoTexto: null, ativo: false });
  });
});

describe("montarLinkWhatsapp", () => {
  it("codifica o texto e usa só os dígitos do número", () => {
    expect(montarLinkWhatsapp("5562999998888", "Olá! Quero saber do GNV & mais")).toBe(
      "https://wa.me/5562999998888?text=Ol%C3%A1!%20Quero%20saber%20do%20GNV%20%26%20mais",
    );
    expect(montarLinkWhatsapp("+55 (62) 99999-8888", "  ")).toBe("https://wa.me/5562999998888");
  });
});
