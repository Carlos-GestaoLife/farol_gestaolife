import { describe, expect, it } from "vitest";
import {
  cortarTexto,
  deveManterTextoAbertura,
  heartbeatSchema,
  validarLoteWhatsapp,
} from "./whatsapp";

function item(n: number, extra: Record<string, unknown> = {}) {
  return {
    wa_msg_id: `false_556299998888@c.us_${n}`,
    chat_id: "556299998888@c.us",
    direcao: "in",
    enviada_em: "2026-10-02T14:03:11Z",
    tipo_midia: "texto",
    contato: { wa_id: "556299998888@c.us", telefone: null, nome_agenda: null, pushname: "Maria" },
    texto_abertura: "Olá",
    ctwa: null,
    ...extra,
  };
}

describe("deveManterTextoAbertura", () => {
  const padroes = ["quero saber do gestao na veia"];

  it("mantém na mensagem recebida que abre a conversa", () => {
    expect(
      deveManterTextoAbertura({ direcao: "in", abreConversa: true, texto: "Oi", padroes: [] }),
    ).toBe(true);
  });

  it("descarta recebida que não abre conversa e não casa padrão", () => {
    expect(
      deveManterTextoAbertura({ direcao: "in", abreConversa: false, texto: "Oi", padroes }),
    ).toBe(false);
  });

  it("mantém quando casa um padrão (igual ou começa com, sem acento e sem caixa)", () => {
    expect(
      deveManterTextoAbertura({
        direcao: "in",
        abreConversa: false,
        texto: "Quero saber do Gestão na Veia Maceió 🙂",
        padroes,
      }),
    ).toBe(true);
    expect(
      deveManterTextoAbertura({
        direcao: "out",
        abreConversa: false,
        texto: "QUERO SABER DO GESTAO NA VEIA",
        padroes,
      }),
    ).toBe(true);
  });

  it("mensagem enviada não abre conversa: só fica com padrão", () => {
    expect(
      deveManterTextoAbertura({ direcao: "out", abreConversa: true, texto: "Bom dia!", padroes }),
    ).toBe(false);
  });

  it("texto vazio ou nulo nunca é mantido", () => {
    expect(
      deveManterTextoAbertura({ direcao: "in", abreConversa: true, texto: null, padroes }),
    ).toBe(false);
    expect(
      deveManterTextoAbertura({ direcao: "in", abreConversa: true, texto: "   ", padroes }),
    ).toBe(false);
  });
});

describe("cortarTexto", () => {
  it("corta em 300 caracteres sem partir emoji", () => {
    expect(cortarTexto("a".repeat(301))).toHaveLength(300);
    const emojis = "😀".repeat(301);
    expect(Array.from(cortarTexto(emojis))).toHaveLength(300);
    expect(cortarTexto("curto")).toBe("curto");
  });
});

describe("validarLoteWhatsapp", () => {
  it("item inválido vai para erros sem derrubar os válidos", () => {
    const r = validarLoteWhatsapp({
      versao_extensao: "0.1.0",
      numero_monitorado: "5562999990000",
      itens: [item(1), item(2, { direcao: "x" }), item(3, { enviada_em: "ontem" }), { lixo: true }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.validos.map((v) => v.wa_msg_id)).toEqual(["false_556299998888@c.us_1"]);
    expect(r.erros).toHaveLength(3);
    expect(r.erros[0]).toMatchObject({ wa_msg_id: "false_556299998888@c.us_2" });
    expect(r.erros[0].motivo).toContain("direcao");
    expect(r.erros[1].motivo).toContain("enviada_em");
    expect(r.erros[2].wa_msg_id).toBeNull();
  });

  it("campos opcionais ausentes viram null e texto acima de 300 é recusado", () => {
    const semOpcionais = item(1);
    delete (semOpcionais as Record<string, unknown>).ctwa;
    delete (semOpcionais as Record<string, unknown>).texto_abertura;
    const r = validarLoteWhatsapp({
      versao_extensao: "0.1.0",
      numero_monitorado: "5562999990000",
      itens: [semOpcionais, item(2, { texto_abertura: "x".repeat(301) })],
    });
    if (!r.ok) throw new Error(r.erro);
    expect(r.validos[0]).toMatchObject({ ctwa: null, texto_abertura: null });
    expect(r.erros).toHaveLength(1);
  });

  it("rejeita o lote com mais de 100 itens", () => {
    const r = validarLoteWhatsapp({
      versao_extensao: "0.1.0",
      numero_monitorado: "5562999990000",
      itens: Array.from({ length: 101 }, (_, i) => item(i)),
    });
    expect(r).toEqual({ ok: false, erro: "Máximo de 100 itens por chamada (recebidos: 101)" });
    const cem = validarLoteWhatsapp({
      versao_extensao: "0.1.0",
      numero_monitorado: "5562999990000",
      itens: Array.from({ length: 100 }, (_, i) => item(i)),
    });
    expect(cem.ok).toBe(true);
  });

  it("rejeita envelope inválido", () => {
    expect(validarLoteWhatsapp(null).ok).toBe(false);
    expect(validarLoteWhatsapp({ numero_monitorado: "5562999990000", itens: [] }).ok).toBe(false);
    expect(
      validarLoteWhatsapp({
        versao_extensao: "0.1.0",
        numero_monitorado: "5562999990000",
        itens: {},
      }).ok,
    ).toBe(false);
  });
});

describe("heartbeatSchema", () => {
  it("valida fila inteira não negativa e data ISO ou null", () => {
    const base = { numero_monitorado: "5562999990000", versao_extensao: "0.1.0" };
    expect(
      heartbeatSchema.safeParse({ ...base, fila_pendente: 3, ultimo_sync_em: null }).success,
    ).toBe(true);
    expect(
      heartbeatSchema.safeParse({
        ...base,
        fila_pendente: 0,
        ultimo_sync_em: "2026-10-02T14:03:11.000Z",
      }).success,
    ).toBe(true);
    expect(
      heartbeatSchema.safeParse({ ...base, fila_pendente: -1, ultimo_sync_em: null }).success,
    ).toBe(false);
    expect(
      heartbeatSchema.safeParse({ ...base, fila_pendente: 1.5, ultimo_sync_em: null }).success,
    ).toBe(false);
    expect(
      heartbeatSchema.safeParse({ ...base, fila_pendente: 0, ultimo_sync_em: "ontem" }).success,
    ).toBe(false);
  });
});
