import { describe, expect, it } from "vitest";
import { daPaginaParaExtensao } from "../src/content/relay";
import { filtrarRecebida } from "../src/main-world/bridge-main";
import { montarMensagem } from "../src/shared/protocol";

const janela = {};
const estado = {
  wpp_pronto: true,
  autenticado: true,
  sincronizado: false,
  numero_proprio: "5562999999999",
  erro: null,
};

describe("content script: página -> service worker", () => {
  it("repassa `estado` do MAIN world, remontado com origem content e o mesmo requestId", () => {
    const original = montarMensagem("estado", "main", estado);
    const saida = daPaginaParaExtensao(janela, janela, original);
    expect(saida).toEqual({ ...original, origem: "content" });
    expect(saida).not.toBe(original);
  });

  it("ignora mensagem fora do namespace", () => {
    const original = montarMensagem("estado", "main", estado);
    expect(daPaginaParaExtensao(janela, janela, { ...original, ns: "__WAGE__" })).toBeNull();
    expect(daPaginaParaExtensao(janela, janela, { ...original, ns: undefined })).toBeNull();
    // Mensagens do próprio WhatsApp ou de outras extensões na página.
    expect(daPaginaParaExtensao(janela, janela, { type: "estado", payload: estado })).toBeNull();
    expect(daPaginaParaExtensao(janela, janela, "qualquer coisa")).toBeNull();
    expect(daPaginaParaExtensao(janela, janela, null)).toBeNull();
  });

  it("ignora mensagem de outra janela (iframe) e de origem que não seja o MAIN world", () => {
    const original = montarMensagem("estado", "main", estado);
    expect(daPaginaParaExtensao({}, janela, original)).toBeNull();
    expect(daPaginaParaExtensao(janela, janela, { ...original, origem: "content" })).toBeNull();
  });

  it("ignora payload fora do schema e tipos ainda não liberados", () => {
    const original = montarMensagem("estado", "main", estado);
    expect(daPaginaParaExtensao(janela, janela, { ...original, payload: { ...estado, wpp_pronto: "sim" } })).toBeNull();
    expect(
      daPaginaParaExtensao(janela, janela, montarMensagem("config", "main", { url_sistema: "https://x.com" })),
    ).toBeNull();
  });

  it("não repassa campos fora do schema", () => {
    const original = { ...montarMensagem("estado", "main", estado), extra: "x" };
    const saida = daPaginaParaExtensao(janela, janela, { ...original, payload: { ...estado, html: "<b>" } });
    expect(saida).not.toBeNull();
    expect(saida).not.toHaveProperty("extra");
    expect(saida?.payload).not.toHaveProperty("html");
  });
});

describe("MAIN world: o que chega pela ponte", () => {
  it("aceita só mensagens do content script no namespace", () => {
    const pedido = montarMensagem("varredura", "content", { fase: "pedido", desde: null });
    expect(filtrarRecebida(janela, janela, pedido)).toEqual(pedido);
    expect(filtrarRecebida(janela, janela, { ...pedido, ns: "OUTRO" })).toBeNull();
    expect(filtrarRecebida({}, janela, pedido)).toBeNull();
  });

  it("descarta o eco das próprias publicações", () => {
    expect(filtrarRecebida(janela, janela, montarMensagem("estado", "main", estado))).toBeNull();
  });
});

describe("content script: mensagem_nova (Etapa 4)", () => {
  const item = {
    wa_msg_id: "false_556288887777@c.us_3EB0AAA",
    chat_id: "556288887777@c.us",
    direcao: "in" as const,
    enviada_em: "2026-10-02T14:03:11.000Z",
    tipo_midia: "texto" as const,
    contato: { wa_id: "556288887777@c.us", telefone: "5562988887777", nome_agenda: null, pushname: "Maria" },
    texto_abertura: null,
    ctwa: null,
  };

  it("repassa mensagem_nova do MAIN world", () => {
    const original = montarMensagem("mensagem_nova", "main", { item, numero_monitorado: "5562999999999" });
    expect(daPaginaParaExtensao(janela, janela, original)).toEqual({ ...original, origem: "content" });
  });

  it("descarta mensagem_nova com item fora do contrato", () => {
    const original = montarMensagem("mensagem_nova", "main", { item, numero_monitorado: "5562999999999" });
    const ruim = { ...original, payload: { ...original.payload, item: { ...item, tipo_midia: "sticker" } } };
    expect(daPaginaParaExtensao(janela, janela, ruim)).toBeNull();
  });
});
