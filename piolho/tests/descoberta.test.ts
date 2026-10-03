import { describe, expect, it } from "vitest";
import { limparParaDescoberta, resumoDescoberta } from "../src/main-world/descoberta";

const MSG = {
  id: { _serialized: "false_556288887777@c.us_3EB0", fromMe: false, remote: { _serialized: "556288887777@c.us", server: "c.us", user: "556288887777" } },
  type: "chat",
  body: "texto privado",
  caption: "legenda privada",
  isNewMsg: true,
  self: "in",
  from: { _serialized: "556288887777@c.us", server: "c.us", user: "556288887777" },
  to: { _serialized: "556299999999@c.us", server: "c.us", user: "556299999999" },
  title: "título da prévia de link",
  quotedMsg: { body: "citação privada" },
  mediaData: { preview: "AAAA" },
  ctwaContext: {
    sourceId: "123456789",
    sourceUrl: "https://fb.me/x",
    title: "Título do anúncio",
    thumbnail: "/9j/" + "A".repeat(400),
    thumbnailUrl: "https://x/y.jpg",
  },
  contextInfo: { externalAdReply: { sourceId: "123456789", jpegThumbnail: "BBBB" } },
  serializarNao: () => "função",
};

describe("modo descoberta", () => {
  it("objeto limpo: sem body, legenda, citação, mídia e thumbnails; Wid vira texto", () => {
    const limpo = limparParaDescoberta(MSG);
    const json = JSON.stringify(limpo);
    for (const proibido of ["texto privado", "legenda privada", "citação privada", "AAAA", "BBBB", "/9j/", "título da prévia"]) {
      expect(json, proibido).not.toContain(proibido);
    }
    expect(limpo.from).toBe("556288887777@c.us");
    expect(limpo.ctwaContext).toEqual({ sourceId: "123456789", sourceUrl: "https://fb.me/x", title: "Título do anúncio" });
    expect(limpo).not.toHaveProperty("serializarNao");
  });

  it("usa serialize() do modelo quando existe", () => {
    const modelo = { serialize: () => ({ ...MSG }), get body() { return "x"; } };
    expect(JSON.stringify(limparParaDescoberta(modelo))).not.toContain("texto privado");
    expect(limparParaDescoberta(modelo).type).toBe("chat");
  });

  it("resumo com os campos da descoberta", () => {
    const r = resumoDescoberta(MSG);
    expect(r).toMatchObject({
      id: "false_556288887777@c.us_3EB0",
      "id.fromMe": false,
      type: "chat",
      self: "in",
      isNewMsg: true,
      from: "556288887777@c.us",
      to: "556299999999@c.us",
      author: null,
      sender: null,
    });
    expect(r.ctwaContext).toEqual({ sourceId: "123456789", sourceUrl: "https://fb.me/x", title: "Título do anúncio" });
    expect(r["contextInfo.externalAdReply"]).toEqual({ sourceId: "123456789" });
    expect(JSON.stringify(r)).not.toContain("texto privado");
  });

  it("aguenta ciclos e valores estranhos", () => {
    const a: Record<string, unknown> = { type: "chat" };
    a.eu = a;
    expect(() => limparParaDescoberta(a)).not.toThrow();
    expect(limparParaDescoberta(null)).toEqual({});
  });
});
