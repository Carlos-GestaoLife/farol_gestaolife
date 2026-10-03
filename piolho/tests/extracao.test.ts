import { describe, expect, it } from "vitest";
import {
  extrairCtwa,
  isoDeUnix,
  mapearTipo,
  montarItem,
  motivoParaIgnorar,
  nomeAgenda,
  type MensagemBruta,
} from "../src/main-world/extracao";
import { itemMensagemSchema } from "../src/shared/protocol";
import { telefoneDeId } from "../src/shared/phone";

const MEU = "5562999999999";
const T = 1_790_000_000; // 2026-09-21T14:13:20Z
const wid = (s: string) => ({ _serialized: s, toString: () => s });

/** Mensagem falsa no formato do MsgModel do wa-js (id.fromMe, from/to como Wid, t em segundos). */
function msg(parcial: Partial<MensagemBruta> & { fromMe?: boolean; idSufixo?: string }): MensagemBruta {
  const fromMe = parcial.fromMe ?? false;
  const contato = "556288887777@c.us";
  const remoto = (parcial.from ?? parcial.to) as { _serialized: string } | undefined;
  return {
    id: { _serialized: `${fromMe}_${remoto?._serialized ?? contato}_${parcial.idSufixo ?? "3EB0AAA"}`, fromMe },
    from: fromMe ? wid(`${MEU}@c.us`) : wid(contato),
    to: fromMe ? wid(contato) : wid(`${MEU}@c.us`),
    t: T,
    type: "chat",
    notifyName: "Maria",
    ...parcial,
  };
}

const resolver = async (id: string) => telefoneDeId(id);

describe("montarItem", () => {
  it("mensagem recebida", async () => {
    const item = await montarItem(msg({}), MEU, resolver, async () => ({ pushname: "Maria Silva" }));
    expect(item).toEqual({
      wa_msg_id: "false_556288887777@c.us_3EB0AAA",
      chat_id: "556288887777@c.us",
      direcao: "in",
      enviada_em: new Date(T * 1000).toISOString(),
      tipo_midia: "texto",
      contato: {
        wa_id: "556288887777@c.us",
        telefone: "5562988887777",
        nome_agenda: null,
        pushname: "Maria Silva",
      },
      texto_abertura: null,
      ctwa: null,
    });
    expect(itemMensagemSchema.safeParse(item).success).toBe(true);
  });

  it("mensagem enviada: chat é o `to`, direção out, sem notifyName como pushname", async () => {
    const item = await montarItem(msg({ fromMe: true, notifyName: "Eu" }), MEU, resolver);
    expect(item?.direcao).toBe("out");
    expect(item?.chat_id).toBe("556288887777@c.us");
    expect(item?.contato.wa_id).toBe("556288887777@c.us");
    expect(item?.contato.pushname).toBeNull();
    expect(item?.wa_msg_id).toBe("true_556288887777@c.us_3EB0AAA");
  });

  it("usa o notifyName como pushname na recebida quando o contato não tem", async () => {
    const item = await montarItem(msg({}), MEU, resolver);
    expect(item?.contato.pushname).toBe("Maria");
  });

  it("nome da agenda só para contato salvo", async () => {
    const salvo = await montarItem(msg({}), MEU, resolver, async () => ({
      isMyContact: true,
      formattedName: "Maria Cliente",
      pushname: "Maria",
    }));
    expect(salvo?.contato.nome_agenda).toBe("Maria Cliente");
    const naoSalvo = await montarItem(msg({}), MEU, resolver, async () => ({
      isMyContact: false,
      formattedName: "+55 62 98888-7777",
    }));
    expect(naoSalvo?.contato.nome_agenda).toBeNull();
    expect(nomeAgenda({ name: "Ana" })).toBe("Ana");
  });

  it("ignora grupo, status, canal, lista de transmissão e chat próprio", async () => {
    const grupo = msg({ from: wid("120363012345678901@g.us") });
    expect(await montarItem(grupo, MEU, resolver)).toBeNull();
    expect(motivoParaIgnorar(grupo, MEU)).toBe("chat g.us");
    expect(await montarItem(msg({ from: wid("status@broadcast") }), MEU, resolver)).toBeNull();
    expect(await montarItem(msg({ from: wid("556288887777@c.us"), isStatusV3: true }), MEU, resolver)).toBeNull();
    expect(await montarItem(msg({ from: wid("120363000000000000@newsletter") }), MEU, resolver)).toBeNull();
    expect(await montarItem(msg({ fromMe: true, to: wid("1600000000@broadcast") }), MEU, resolver)).toBeNull();
    const paraMim = msg({ fromMe: true, to: wid("556299999999@c.us") });
    expect(motivoParaIgnorar(paraMim, MEU)).toBe("chat próprio");
  });

  it("ignora notificações e mensagem ainda cifrada; apagada vira outro", async () => {
    for (const type of ["e2e_notification", "notification_template", "gp2", "call_log", "protocol", "ciphertext"]) {
      expect(await montarItem(msg({ type }), MEU, resolver), type).toBeNull();
    }
    expect((await montarItem(msg({ type: "revoked" }), MEU, resolver))?.tipo_midia).toBe("outro");
  });

  it("chat @lid: wa_id é o lid e telefone vem da resolução (ou null)", async () => {
    const lid = msg({ from: wid("123456789012345@lid") });
    const semNumero = await montarItem(lid, MEU, resolver);
    expect(semNumero?.chat_id).toBe("123456789012345@lid");
    expect(semNumero?.contato.telefone).toBeNull();
    const comNumero = await montarItem(lid, MEU, async (id) => telefoneDeId(id, "556277776666@c.us"));
    expect(comNumero?.contato.telefone).toBe("5562977776666");
  });

  it("aceita from/to como string e resolvedores que falham", async () => {
    const m = msg({ from: "556288887777@c.us" });
    const item = await montarItem(
      m,
      MEU,
      async () => {
        throw new Error("x");
      },
      async () => {
        throw new Error("y");
      },
    );
    expect(item?.chat_id).toBe("556288887777@c.us");
    expect(item?.contato.telefone).toBeNull();
  });

  it("descarta sem id, sem data válida ou sem chat", async () => {
    expect(await montarItem({ ...msg({}), id: null }, MEU, resolver)).toBeNull();
    expect(await montarItem({ ...msg({}), t: undefined }, MEU, resolver)).toBeNull();
    expect(await montarItem({ ...msg({}), from: undefined }, MEU, resolver)).toBeNull();
  });

  it("nunca lê o corpo da mensagem", async () => {
    const item = await montarItem({ ...msg({}), body: "conteúdo privado" } as MensagemBruta, MEU, resolver);
    expect(JSON.stringify(item)).not.toContain("conteúdo privado");
  });
});

describe("mapearTipo", () => {
  it("mapeia os tipos do WhatsApp para tipo_midia", () => {
    expect(mapearTipo("chat")).toBe("texto");
    expect(mapearTipo("ptt")).toBe("audio");
    expect(mapearTipo("audio")).toBe("audio");
    expect(mapearTipo("image")).toBe("imagem");
    expect(mapearTipo("video")).toBe("video");
    expect(mapearTipo("document")).toBe("documento");
    expect(mapearTipo("sticker")).toBe("figurinha");
    expect(mapearTipo("location")).toBe("localizacao");
    expect(mapearTipo("live_location")).toBe("localizacao");
    expect(mapearTipo("vcard")).toBe("contato");
    expect(mapearTipo("multi_vcard")).toBe("contato");
    expect(mapearTipo("poll_creation")).toBe("outro");
    expect(mapearTipo("revoked")).toBe("outro");
    expect(mapearTipo(undefined)).toBe("outro");
    expect(mapearTipo("toString")).toBe("outro");
  });
});

describe("isoDeUnix", () => {
  it("converte segundos em ISO e rejeita inválidos", () => {
    expect(isoDeUnix(1_790_000_000)).toBe("2026-09-21T14:13:20.000Z");
    expect(isoDeUnix("1790000000")).toBe("2026-09-21T14:13:20.000Z");
    expect(isoDeUnix(0)).toBeNull();
    expect(isoDeUnix("x")).toBeNull();
  });
});

describe("extrairCtwa", () => {
  /** Exemplo usado também na conferência com o servidor (extrairMetaAdIdDoCtwa). */
  const CTWA_CONTEXT = {
    conversionSource: "FB_Ads",
    sourceId: "123456789",
    sourceType: "ad",
    sourceUrl: "https://fb.me/abcdef?ad_id=123456789&utm_source=x",
    title: "Gestão na Veia Maceió",
    description: "Imersão presencial",
    mediaType: 1,
    thumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD" + "A".repeat(500),
    thumbnailUrl: "https://scontent.xx.fbcdn.net/x.jpg",
    ctwaClid: "Afc123clique",
    isSuspiciousLink: false,
  };

  it("caminho msg.ctwaContext: só os campos do anúncio, sem thumbnail nem id do clique", () => {
    expect(extrairCtwa(msg({ ctwaContext: CTWA_CONTEXT }))).toEqual({
      sourceId: "123456789",
      sourceType: "ad",
      sourceUrl: "https://fb.me/abcdef?ad_id=123456789&utm_source=x",
      title: "Gestão na Veia Maceió",
      description: "Imersão presencial",
      mediaType: 1,
      isSuspiciousLink: false,
    });
  });

  it("caminho msg.contextInfo.externalAdReply (sem o body do anúncio)", () => {
    const ctwa = extrairCtwa(
      msg({
        contextInfo: {
          externalAdReply: {
            source_id: "987654321",
            source_type: "ad",
            source_url: "https://www.instagram.com/p/xyz",
            title: "Anúncio",
            body: "texto do anúncio",
            media_type: "IMAGE",
            jpegThumbnail: "AAAA",
            is_suspicious_link: true,
          },
          quotedMessage: { conversation: "segredo" },
        },
      }),
    );
    expect(ctwa).toEqual({
      source_id: "987654321",
      source_type: "ad",
      source_url: "https://www.instagram.com/p/xyz",
      title: "Anúncio",
      media_type: "IMAGE",
      is_suspicious_link: true,
    });
    expect(JSON.stringify(ctwa)).not.toContain("segredo");
  });

  it("os dois caminhos: ctwaContext tem preferência, campos ausentes vêm do externalAdReply", () => {
    const ctwa = extrairCtwa(
      msg({ ctwaContext: { sourceId: "111" }, contextInfo: { externalAdReply: { sourceId: "222", title: "T" } } }),
    );
    expect(ctwa).toEqual({ sourceId: "111", title: "T" });
  });

  it("sem contexto, contexto vazio ou só com campos proibidos: null", () => {
    expect(extrairCtwa(msg({}))).toBeNull();
    expect(extrairCtwa(msg({ ctwaContext: null, contextInfo: {} }))).toBeNull();
    expect(extrairCtwa(msg({ ctwaContext: { thumbnail: "AAAA", ctwaClid: "x", sourceId: "  " } }))).toBeNull();
    expect(extrairCtwa(msg({ ctwaContext: "texto" }))).toBeNull();
  });

  it("montarItem leva o ctwa", async () => {
    const item = await montarItem(msg({ ctwaContext: CTWA_CONTEXT }), MEU, resolver);
    expect(item?.ctwa?.sourceId).toBe("123456789");
    expect(itemMensagemSchema.safeParse(item).success).toBe(true);
  });
});
