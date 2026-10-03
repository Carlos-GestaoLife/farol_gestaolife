import { describe, expect, it } from "vitest";
import { daExtensaoParaPagina, daPaginaParaExtensao, mensagemDescoberta } from "../src/content/relay";
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
    const pedido = montarMensagem("varredura", "content", { fase: "pedido", desde: null, forcada: false });
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

describe("Etapas 5 a 7: padroes, obter_padroes, descoberta e varredura", () => {
  const progresso = {
    fase: "progresso" as const,
    desde: "2026-09-03T12:00:00.000Z",
    chats_total: 40,
    chats_processados: 11,
    itens_enfileirados: 350,
    chat_atual: "556288887777@c.us",
    concluida: false,
    cancelada: false,
    erro: null,
  };

  it("página -> service worker: obter_padroes e varredura só na fase progresso", () => {
    const pedePadroes = montarMensagem("obter_padroes", "main", null);
    expect(daPaginaParaExtensao(janela, janela, pedePadroes)).toEqual({ ...pedePadroes, origem: "content" });
    const prog = montarMensagem("varredura", "main", progresso);
    expect(daPaginaParaExtensao(janela, janela, prog)).toEqual({ ...prog, origem: "content" });
    // A página não pode pedir nem cancelar varredura, nem mandar padrões.
    expect(daPaginaParaExtensao(janela, janela, montarMensagem("varredura", "main", { fase: "pedido", desde: null, forcada: true }))).toBeNull();
    expect(daPaginaParaExtensao(janela, janela, montarMensagem("varredura", "main", { fase: "cancelar" }))).toBeNull();
    expect(daPaginaParaExtensao(janela, janela, montarMensagem("padroes", "main", { padroes_texto: ["x"] }))).toBeNull();
    expect(daPaginaParaExtensao(janela, janela, montarMensagem("descoberta", "main", { ativo: true }))).toBeNull();
  });

  it("service worker -> página: padroes e varredura pedido/cancelar, remontados com origem content", () => {
    const padroes = montarMensagem("padroes", "service_worker", { padroes_texto: ["Olá! Quero saber do Gestão na Veia"] });
    expect(daExtensaoParaPagina(true, padroes)).toEqual({ ...padroes, origem: "content" });
    const pedido = montarMensagem("varredura", "service_worker", { fase: "pedido", desde: "2026-10-01T00:00:00.000Z", forcada: false });
    expect(daExtensaoParaPagina(true, pedido)).toEqual({ ...pedido, origem: "content" });
    const cancelar = montarMensagem("varredura", "service_worker", { fase: "cancelar" });
    expect(daExtensaoParaPagina(true, cancelar)).toEqual({ ...cancelar, origem: "content" });
  });

  it("service worker -> página: recusa remetente que não é o service worker, outra origem e outros tipos", () => {
    const padroes = montarMensagem("padroes", "service_worker", { padroes_texto: [] });
    expect(daExtensaoParaPagina(false, padroes)).toBeNull();
    expect(daExtensaoParaPagina(true, { ...padroes, origem: "painel" })).toBeNull();
    expect(daExtensaoParaPagina(true, montarMensagem("varredura", "service_worker", progresso))).toBeNull();
    expect(daExtensaoParaPagina(true, montarMensagem("estado", "service_worker", estado))).toBeNull();
    expect(daExtensaoParaPagina(true, { ...padroes, payload: { padroes_texto: "x" } })).toBeNull();
  });

  it("MAIN world aceita padroes, descoberta e varredura (pedido/cancelar) do content; recusa progresso", () => {
    const padroes = montarMensagem("padroes", "content", { padroes_texto: ["a"] });
    expect(filtrarRecebida(janela, janela, padroes)).toEqual(padroes);
    const desc = mensagemDescoberta(true);
    expect(filtrarRecebida(janela, janela, desc)?.payload).toEqual({ ativo: true });
    expect(mensagemDescoberta("sim").payload).toEqual({ ativo: false });
    const cancelar = montarMensagem("varredura", "content", { fase: "cancelar" });
    expect(filtrarRecebida(janela, janela, cancelar)).toEqual(cancelar);
    expect(filtrarRecebida(janela, janela, montarMensagem("varredura", "content", progresso))).toBeNull();
    expect(filtrarRecebida(janela, janela, montarMensagem("mensagem_nova", "content", {
      item: { wa_msg_id: "x", chat_id: "556288887777@c.us", direcao: "in", enviada_em: "2026-10-02T14:03:11.000Z", tipo_midia: "texto",
        contato: { wa_id: "556288887777@c.us", telefone: null, nome_agenda: null, pushname: null }, texto_abertura: null, ctwa: null },
      numero_monitorado: "5562999999999",
    }))).toBeNull();
  });
});
