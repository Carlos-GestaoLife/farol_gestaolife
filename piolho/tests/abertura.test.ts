import { describe, expect, it } from "vitest";
import { JANELA_ABERTURA_SEG, avaliarAbertura, decidirTextoAbertura } from "../src/main-world/abertura";
import { montarItem, type MensagemBruta, type RegraTexto } from "../src/main-world/extracao";
import { telefoneDeId } from "../src/shared/phone";
import { itemMensagemSchema } from "../src/shared/protocol";

const MEU = "5562999999999";
const T = 1_790_000_000;
const DIA = 24 * 60 * 60;
const CONTATO = "556288887777@c.us";
const PADRAO = "Olá! Quero saber do Gestão na Veia";
const resolver = async (id: string) => telefoneDeId(id);

function msg(parcial: Partial<MensagemBruta> & { fromMe?: boolean } = {}): MensagemBruta {
  const fromMe = parcial.fromMe ?? false;
  return {
    id: { _serialized: `${fromMe}_${CONTATO}_ABC`, fromMe },
    from: fromMe ? `${MEU}@c.us` : CONTATO,
    to: fromMe ? CONTATO : `${MEU}@c.us`,
    t: T,
    type: "chat",
    body: "Olá! Quero saber do Gestão na Veia Maceió",
    ...parcial,
  };
}

function regra(abertura: "abre" | "nao_abre" | "nao_sei", padroes: string[] = []): RegraTexto & { chamadas: number } {
  const r = {
    padroes,
    chamadas: 0,
    avaliarAbertura: async () => {
      r.chamadas++;
      return abertura;
    },
  };
  return r;
}

describe("avaliarAbertura (regra a)", () => {
  it("anterior com até 30 dias (inclusive) impede; mais velha abre", () => {
    expect(avaliarAbertura(T, T - 60, false)).toBe("nao_abre");
    expect(avaliarAbertura(T, T - JANELA_ABERTURA_SEG, false)).toBe("nao_abre");
    expect(avaliarAbertura(T, T - JANELA_ABERTURA_SEG - 1, false)).toBe("abre");
    expect(avaliarAbertura(T, T - 40 * DIA, false)).toBe("abre");
  });

  it("sem anterior: abre só se o histórico local acabou; senão não sei", () => {
    expect(avaliarAbertura(T, null, true)).toBe("abre");
    expect(avaliarAbertura(T, null, false)).toBe("nao_sei");
  });
});

describe("texto_abertura (montarItem com a regra)", () => {
  it("(a) abre conversa: texto vai", async () => {
    const item = await montarItem(msg({ body: "oi" }), MEU, resolver, undefined, regra("abre"));
    expect(item?.texto_abertura).toBe("oi");
    expect(itemMensagemSchema.safeParse(item).success).toBe(true);
  });

  it("(b) casa com padrão num chat que já tinha mensagem: texto vai, sem consultar o histórico", async () => {
    const r = regra("nao_abre", [PADRAO]);
    const item = await montarItem(msg(), MEU, resolver, undefined, r);
    expect(item?.texto_abertura).toBe("Olá! Quero saber do Gestão na Veia Maceió");
    expect(r.chamadas).toBe(0);
  });

  it("nem um nem outro: null (inclusive com \"não sei\")", async () => {
    expect((await montarItem(msg({ body: "oi" }), MEU, resolver, undefined, regra("nao_abre", [PADRAO])))?.texto_abertura).toBeNull();
    expect((await montarItem(msg({ body: "oi" }), MEU, resolver, undefined, regra("nao_sei", [PADRAO])))?.texto_abertura).toBeNull();
  });

  it("enviada: null mesmo abrindo e casando, e nem consulta o histórico", async () => {
    const r = regra("abre", [PADRAO]);
    const item = await montarItem(msg({ fromMe: true }), MEU, resolver, undefined, r);
    expect(item?.texto_abertura).toBeNull();
    expect(r.chamadas).toBe(0);
  });

  it("não texto: null (imagem com legenda, áudio)", async () => {
    for (const type of ["image", "ptt", "document"]) {
      const item = await montarItem(msg({ type, body: "base64..." }), MEU, resolver, undefined, regra("abre", [PADRAO]));
      expect(item?.texto_abertura, type).toBeNull();
    }
  });

  it("corta em 300 sem partir emoji", async () => {
    const body = "Olá! Quero saber do Gestão na Veia " + "a".repeat(264) + "😀😀";
    const item = await montarItem(msg({ body }), MEU, resolver, undefined, regra("nao_abre", [PADRAO]));
    expect(item?.texto_abertura?.length).toBeLessThanOrEqual(300);
    expect(item?.texto_abertura?.endsWith("a")).toBe(true);
    expect(itemMensagemSchema.safeParse(item).success).toBe(true);
  });

  it("falha ao avaliar a abertura vale \"não sei\"", async () => {
    const r: RegraTexto = {
      padroes: [],
      avaliarAbertura: async () => {
        throw new Error("x");
      },
    };
    expect((await montarItem(msg({ body: "oi" }), MEU, resolver, undefined, r))?.texto_abertura).toBeNull();
  });

  it("sem regra (padrão): null e corpo não lido", async () => {
    const item = await montarItem(msg({ body: "conteúdo privado" }), MEU, resolver);
    expect(item?.texto_abertura).toBeNull();
    expect(JSON.stringify(item)).not.toContain("conteúdo privado");
  });

  it("decidirTextoAbertura: texto vazio ou não string é null", () => {
    const base = { enviada: false, tipo: "chat", abertura: "abre" as const, padroes: [] };
    expect(decidirTextoAbertura({ ...base, texto: "   " })).toBeNull();
    expect(decidirTextoAbertura({ ...base, texto: 42 })).toBeNull();
    expect(decidirTextoAbertura({ ...base, texto: "Oi" })).toBe("Oi");
  });
});
