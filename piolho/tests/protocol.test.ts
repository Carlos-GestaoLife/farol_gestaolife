import { describe, expect, it } from "vitest";
import {
  LIMITES,
  NS,
  TIPOS_MIDIA,
  heartbeatSchema,
  itemMensagemSchema,
  loteIngestaoSchema,
  montarMensagem,
  respostaHeartbeatSchema,
  respostaIngestaoSchema,
  validarMensagem,
  type ItemMensagem,
} from "../src/shared/protocol";

// Exemplo literal da seção "API de ingestão" do sistema-leads/CLAUDE.md.
const EXEMPLO_CLAUDE_MD = {
  versao_extensao: "0.1.0",
  numero_monitorado: "5562999999999",
  itens: [
    {
      wa_msg_id: "true_5562...@c.us_3EB0...",
      chat_id: "5562...@c.us",
      direcao: "in",
      enviada_em: "2026-10-02T14:03:11Z",
      tipo_midia: "texto",
      contato: { wa_id: "5562...@c.us", telefone: "5562...", nome_agenda: null, pushname: "Maria" },
      texto_abertura: "Olá! Quero saber do Gestão na Veia Maceió",
      ctwa: null,
    },
  ],
};

const ITEM: ItemMensagem = {
  wa_msg_id: "false_5562988887777@c.us_3EB0ABCDEF",
  chat_id: "5562988887777@c.us",
  direcao: "out",
  enviada_em: "2026-10-02T14:03:11.000Z",
  tipo_midia: "audio",
  contato: { wa_id: "5562988887777@c.us", telefone: "5562988887777", nome_agenda: "Ana", pushname: null },
  texto_abertura: null,
  ctwa: { source_id: "123", source_url: "https://fb.me/x" },
};

describe("contrato com o servidor", () => {
  it("aceita o exemplo do CLAUDE.md do sistema", () => {
    const r = loteIngestaoSchema.safeParse(EXEMPLO_CLAUDE_MD);
    expect(r.success).toBe(true);
  });

  it("aceita um item completo e com ctwa", () => {
    expect(itemMensagemSchema.safeParse(ITEM).success).toBe(true);
  });

  it("tem o mesmo enum de tipo_midia do servidor", () => {
    expect(TIPOS_MIDIA).toEqual([
      "texto",
      "audio",
      "imagem",
      "video",
      "documento",
      "figurinha",
      "localizacao",
      "contato",
      "outro",
    ]);
    expect(itemMensagemSchema.safeParse({ ...ITEM, tipo_midia: "sticker" }).success).toBe(false);
  });

  it("rejeita item com direcao inválida", () => {
    expect(itemMensagemSchema.safeParse({ ...ITEM, direcao: "entrada" }).success).toBe(false);
    const lote = { ...EXEMPLO_CLAUDE_MD, itens: [{ ...EXEMPLO_CLAUDE_MD.itens[0], direcao: "x" }] };
    expect(loteIngestaoSchema.safeParse(lote).success).toBe(false);
  });

  it("rejeita texto_abertura com mais de 300 caracteres e aceita exatamente 300", () => {
    expect(itemMensagemSchema.safeParse({ ...ITEM, texto_abertura: "a".repeat(301) }).success).toBe(false);
    expect(itemMensagemSchema.safeParse({ ...ITEM, texto_abertura: "a".repeat(300) }).success).toBe(true);
  });

  it("rejeita lote com mais de 100 itens e aceita exatamente 100", () => {
    const itens = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...ITEM, wa_msg_id: `${ITEM.wa_msg_id}_${i}` }));
    const base = { versao_extensao: "0.1.0", numero_monitorado: "5562999999999" };
    expect(loteIngestaoSchema.safeParse({ ...base, itens: itens(LIMITES.itensPorLote) }).success).toBe(true);
    expect(loteIngestaoSchema.safeParse({ ...base, itens: itens(LIMITES.itensPorLote + 1) }).success).toBe(false);
  });

  it("rejeita data sem fuso e contato incompleto", () => {
    expect(itemMensagemSchema.safeParse({ ...ITEM, enviada_em: "2026-10-02 14:03:11" }).success).toBe(false);
    const { pushname: _p, ...semPushname } = ITEM.contato;
    expect(itemMensagemSchema.safeParse({ ...ITEM, contato: semPushname }).success).toBe(false);
  });

  it("valida a resposta da ingestão, inclusive erro sem wa_msg_id", () => {
    const r = respostaIngestaoSchema.safeParse({
      aceitos: ["a", "b"],
      erros: [
        { wa_msg_id: "c", motivo: "Item inválido" },
        { wa_msg_id: null, motivo: "Item inválido" },
      ],
    });
    expect(r.success).toBe(true);
    expect(respostaIngestaoSchema.safeParse({ aceitos: "a", erros: [] }).success).toBe(false);
  });

  it("valida heartbeat e resposta do heartbeat", () => {
    expect(
      heartbeatSchema.safeParse({
        numero_monitorado: "5562999999999",
        versao_extensao: "0.1.0",
        fila_pendente: 0,
        ultimo_sync_em: null,
      }).success,
    ).toBe(true);
    expect(
      heartbeatSchema.safeParse({
        numero_monitorado: "5562999999999",
        versao_extensao: "0.1.0",
        fila_pendente: -1,
        ultimo_sync_em: null,
      }).success,
    ).toBe(false);
    expect(
      respostaHeartbeatSchema.safeParse({ ultimo_sync_servidor: "2026-10-02T14:03:11.000Z", padroes_texto: ["gestao"] })
        .success,
    ).toBe(true);
    expect(respostaHeartbeatSchema.safeParse({ ultimo_sync_servidor: null, padroes_texto: [] }).success).toBe(true);
    expect(respostaHeartbeatSchema.safeParse({ ultimo_sync_servidor: null }).success).toBe(false);
  });
});

describe("envelope da ponte", () => {
  const estado = {
    wpp_pronto: true,
    autenticado: true,
    sincronizado: true,
    numero_proprio: "5562999999999",
    erro: null,
  };

  it("aceita o que montarMensagem produz", () => {
    const m = montarMensagem("estado", "main", estado);
    expect(m.ns).toBe(NS);
    expect(m.requestId).toMatch(/^[0-9a-f]{24}$/);
    expect(validarMensagem(m)).toEqual(m);
    const pedido = montarMensagem("obter_estado", "painel", null);
    expect(validarMensagem(pedido)).toEqual(pedido);
  });

  it("aceita os tipos previstos para as próximas etapas", () => {
    expect(
      validarMensagem(montarMensagem("mensagem_nova", "main", { item: ITEM, numero_monitorado: "5562999999999" })),
    ).not.toBeNull();
    // Número monitorado fora da forma canônica.
    expect(
      validarMensagem(montarMensagem("mensagem_nova", "main", { item: ITEM, numero_monitorado: "5562999999999@c.us" })),
    ).toBeNull();
    expect(validarMensagem(montarMensagem("varredura", "service_worker", { fase: "pedido", desde: null, forcada: true }))).not.toBeNull();
    expect(
      validarMensagem(
        montarMensagem("varredura", "main", {
          fase: "progresso",
          desde: "2026-09-03T12:00:00.000Z",
          chats_total: 10,
          chats_processados: 3,
          itens_enfileirados: 42,
          chat_atual: "556288887777@c.us",
          concluida: false,
          cancelada: false,
          erro: null,
        }),
      ),
    ).not.toBeNull();
    expect(
      validarMensagem(montarMensagem("config", "painel", { url_sistema: "https://exemplo.com" })),
    ).not.toBeNull();
    expect(validarMensagem(montarMensagem("heartbeat_agora", "painel", null))).not.toBeNull();
    expect(validarMensagem(montarMensagem("tick_teste", "painel", null))).not.toBeNull();
  });

  it("Etapas 5 a 7: padroes, obter_padroes, descoberta e varredura (pedido, cancelar, progresso)", () => {
    expect(validarMensagem(montarMensagem("padroes", "service_worker", { padroes_texto: ["a", "b"] }))).not.toBeNull();
    expect(validarMensagem({ ...montarMensagem("padroes", "service_worker", { padroes_texto: [] }), payload: { padroes_texto: [1] } })).toBeNull();
    expect(
      validarMensagem({ ...montarMensagem("padroes", "service_worker", { padroes_texto: [] }), payload: { padroes_texto: ["x".repeat(LIMITES.padrao + 1)] } }),
    ).toBeNull();
    expect(validarMensagem(montarMensagem("obter_padroes", "main", null))).not.toBeNull();
    expect(validarMensagem(montarMensagem("descoberta", "content", { ativo: true }))).not.toBeNull();
    expect(validarMensagem({ ...montarMensagem("descoberta", "content", { ativo: true }), payload: { ativo: "sim" } })).toBeNull();
    expect(validarMensagem(montarMensagem("varredura", "painel", { fase: "cancelar" }))).not.toBeNull();
    // Pedido sem `forcada` e progresso com contador negativo ficam de fora.
    expect(validarMensagem({ ...montarMensagem("varredura", "painel", { fase: "cancelar" }), payload: { fase: "pedido", desde: null } })).toBeNull();
    expect(
      validarMensagem({
        ...montarMensagem("varredura", "main", { fase: "cancelar" }),
        payload: { fase: "progresso", desde: null, chats_total: -1, chats_processados: 0, itens_enfileirados: 0, chat_atual: null, concluida: false, cancelada: false, erro: null },
      }),
    ).toBeNull();
  });

  it("a mensagem config nunca carrega o token", () => {
    const m = { ...montarMensagem("config", "painel", { url_sistema: "https://exemplo.com" }) };
    const v = validarMensagem({ ...m, payload: { url_sistema: "https://exemplo.com", token: "pio_segredo" } });
    expect(v?.payload).toEqual({ url_sistema: "https://exemplo.com" });
  });

  it("rejeita namespace, origem, tipo e requestId errados", () => {
    const m = montarMensagem("estado", "main", estado);
    expect(validarMensagem({ ...m, ns: "__WAGE__" })).toBeNull();
    expect(validarMensagem({ ...m, origem: "pagina" })).toBeNull();
    expect(validarMensagem({ ...m, tipo: "enviar_mensagem" })).toBeNull();
    expect(validarMensagem({ ...m, requestId: "" })).toBeNull();
    expect(validarMensagem({ ...m, requestId: "a".repeat(LIMITES.requestId + 1) })).toBeNull();
    expect(validarMensagem(null)).toBeNull();
    expect(validarMensagem("estado")).toBeNull();
  });

  it("rejeita número próprio fora da forma canônica", () => {
    const m = montarMensagem("estado", "main", { ...estado, numero_proprio: "5562999999999@c.us" });
    expect(validarMensagem(m)).toBeNull();
  });

  it("descarta campos fora do schema", () => {
    const m = { ...montarMensagem("estado", "main", estado), extra: "x" };
    const v = validarMensagem({ ...m, payload: { ...estado, segredo: 1 } });
    expect(v).not.toBeNull();
    expect(v).not.toHaveProperty("extra");
    expect(v?.payload).not.toHaveProperty("segredo");
  });
});
