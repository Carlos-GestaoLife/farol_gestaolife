import { describe, expect, it } from "vitest";
import { montarItem, type MensagemBruta } from "../src/main-world/extracao";
import {
  mensagensDoChat,
  selecionarChats,
  varrer,
  type ChatResumo,
  type DepsVarredura,
  type HistoricoChat,
} from "../src/main-world/varredura";
import { telefoneDeId } from "../src/shared/phone";
import type { ItemMensagem, ProgressoVarredura } from "../src/shared/protocol";
import { checkpointEfetivo, desdeDoPedido } from "../src/shared/varredura";

const MEU = "5562999999999";
const AGORA = Date.parse("2026-10-03T12:00:00Z");
const AGORA_S = AGORA / 1000;
const DIA = 24 * 60 * 60;

function m(chat: string, id: string, t: number, opcoes: { fromMe?: boolean; type?: string; body?: string } = {}): MensagemBruta {
  const fromMe = opcoes.fromMe ?? false;
  return {
    id: { _serialized: `${fromMe}_${chat}_${id}`, fromMe },
    from: fromMe ? `${MEU}@c.us` : chat,
    to: fromMe ? chat : `${MEU}@c.us`,
    t,
    type: opcoes.type ?? "chat",
    body: opcoes.body ?? "oi",
  };
}

describe("checkpoint da varredura", () => {
  it("pedido normal: o maior entre o local e o do servidor; forçada: null", () => {
    expect(desdeDoPedido("2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z", false)).toBe("2026-10-02T00:00:00.000Z");
    expect(desdeDoPedido("2026-10-02T10:00:00.000Z", "2026-10-02T00:00:00.000Z", false)).toBe("2026-10-02T10:00:00.000Z");
    expect(desdeDoPedido(null, "2026-10-02T00:00:00.000Z", false)).toBe("2026-10-02T00:00:00.000Z");
    expect(desdeDoPedido(null, null, false)).toBeNull();
    expect(desdeDoPedido("2026-10-02T10:00:00.000Z", "2026-10-02T00:00:00.000Z", true)).toBeNull();
  });

  it("efetivo: nunca antes de agora menos 30 dias", () => {
    expect(checkpointEfetivo(null, AGORA)).toBe(AGORA - 30 * DIA * 1000);
    expect(checkpointEfetivo("2026-01-01T00:00:00Z", AGORA)).toBe(AGORA - 30 * DIA * 1000);
    expect(checkpointEfetivo("2026-10-02T00:00:00.000Z", AGORA)).toBe(Date.parse("2026-10-02T00:00:00Z"));
  });
});

describe("selecionarChats", () => {
  const chats: ChatResumo[] = [
    { chatId: "556211111111@c.us", ultimaMensagemEm: AGORA_S - 2 * DIA },
    { chatId: "556222222222@c.us", ultimaMensagemEm: AGORA_S - 40 * DIA },
    { chatId: "120363000000000000@g.us", ultimaMensagemEm: AGORA_S - 60 },
    { chatId: "status@broadcast", ultimaMensagemEm: AGORA_S - 60 },
    { chatId: "120363000000000001@newsletter", ultimaMensagemEm: AGORA_S - 60 },
    { chatId: "123456789012345@lid", ultimaMensagemEm: AGORA_S - 60 },
    { chatId: "556233333333@c.us", ultimaMensagemEm: null },
    { chatId: "556211111111@c.us", ultimaMensagemEm: AGORA_S - 2 * DIA },
  ];

  it("só individuais, com atividade depois do checkpoint (ou sem data), mais recentes primeiro, sem repetir", () => {
    const cp = AGORA_S - 30 * DIA;
    expect(selecionarChats(chats, cp).map((c) => c.chatId)).toEqual([
      "556233333333@c.us",
      "123456789012345@lid",
      "556211111111@c.us",
    ]);
  });
});

describe("mensagensDoChat", () => {
  const chat = "556211111111@c.us";
  const cp = AGORA_S - 10 * DIA;

  it("corta pelo checkpoint, ordena, tira notificações e repetidas", () => {
    const hist: HistoricoChat = {
      semMaisHistorico: false,
      mensagens: [
        m(chat, "C", AGORA_S - 2 * DIA, { fromMe: true }),
        m(chat, "A", AGORA_S - 20 * DIA),
        m(chat, "B", AGORA_S - 5 * DIA),
        m(chat, "N", AGORA_S - 4 * DIA, { type: "e2e_notification" }),
        m(chat, "B", AGORA_S - 5 * DIA),
      ],
    };
    const r = mensagensDoChat(hist, cp, MEU);
    expect(r.map((x) => (x.msg.id as { _serialized: string })._serialized)).toEqual([
      `false_${chat}_B`,
      `true_${chat}_C`,
    ]);
    // B tem anterior (A, 15 dias antes): não abre.
    expect(r[0].abertura).toBe("nao_abre");
  });

  it("abertura pelo histórico: anterior com mais de 30 dias abre; sem anterior depende do fim do histórico", () => {
    const longo = mensagensDoChat({ semMaisHistorico: false, mensagens: [m(chat, "A", AGORA_S - 50 * DIA), m(chat, "B", AGORA_S - DIA)] }, cp, MEU);
    expect(longo[0].abertura).toBe("abre");
    expect(mensagensDoChat({ semMaisHistorico: true, mensagens: [m(chat, "B", AGORA_S - DIA)] }, cp, MEU)[0].abertura).toBe("abre");
    expect(mensagensDoChat({ semMaisHistorico: false, mensagens: [m(chat, "B", AGORA_S - DIA)] }, cp, MEU)[0].abertura).toBe("nao_sei");
  });
});

describe("varrer (dados falsos)", () => {
  const PADRAO = "quero saber";
  const historicos: Record<string, MensagemBruta[]> = {
    "556211111111@c.us": [
      m("556211111111@c.us", "A1", AGORA_S - 45 * DIA, { body: "antiga" }),
      m("556211111111@c.us", "A2", AGORA_S - 5 * DIA, { body: "Quero saber do curso" }),
      m("556211111111@c.us", "A3", AGORA_S - 4 * DIA, { fromMe: true, body: "claro" }),
    ],
    "556222222222@c.us": [m("556222222222@c.us", "B1", AGORA_S - 3 * DIA, { body: "oi" })],
    "556233333333@c.us": [
      m("556233333333@c.us", "C1", AGORA_S - 20 * DIA, { body: "oi" }),
      m("556233333333@c.us", "C2", AGORA_S - DIA, { body: "oi de novo" }),
    ],
  };
  const chats: ChatResumo[] = [
    ...Object.keys(historicos).map((chatId) => ({ chatId, ultimaMensagemEm: AGORA_S - DIA })),
    { chatId: "120363000000000000@g.us", ultimaMensagemEm: AGORA_S },
  ];

  function deps(carregados: string[]): DepsVarredura {
    return {
      listarChatsIndividuais: async () => chats,
      carregarMensagensDesde: async (chatId) => {
        carregados.push(chatId);
        return { mensagens: historicos[chatId] ?? [], semMaisHistorico: true };
      },
      montarItem: (msg, regra) => montarItem(msg, MEU, async (id) => telefoneDeId(id), async () => undefined, regra),
      meuNumero: () => MEU,
      padroes: () => [PADRAO],
      pausa: async () => undefined,
      agora: () => AGORA,
    };
  }

  it("enfileira só os 30 dias dos chats individuais, com texto_abertura pela regra e progresso", async () => {
    const itens: ItemMensagem[] = [];
    const progressos: ProgressoVarredura[] = [];
    const carregados: string[] = [];
    const fim = await varrer(deps(carregados), {
      desde: null,
      aoItem: (i) => itens.push(i),
      aoProgresso: (p) => progressos.push(p),
      cancelada: () => false,
    });
    expect(carregados).not.toContain("120363000000000000@g.us");
    const porId = Object.fromEntries(itens.map((i) => [i.wa_msg_id.split("_").pop(), i]));
    expect(Object.keys(porId).sort()).toEqual(["A2", "A3", "B1", "C1", "C2"]);
    // A2: casa com o padrão. B1: abre conversa (histórico acabou). C1: abre (início do histórico).
    // C2: anterior C1 há 19 dias, sem padrão: null. A3: enviada.
    expect(porId.A2.texto_abertura).toBe("Quero saber do curso");
    expect(porId.B1.texto_abertura).toBe("oi");
    expect(porId.C1.texto_abertura).toBe("oi");
    expect(porId.C2.texto_abertura).toBeNull();
    expect(porId.A3.texto_abertura).toBeNull();
    expect(fim).toMatchObject({ chats_total: 3, chats_processados: 3, itens_enfileirados: 5, concluida: true, cancelada: false, erro: null });
    expect(progressos[0]).toMatchObject({ chats_total: 3, chats_processados: 0 });
    expect(progressos.some((p) => p.chat_atual === "556211111111@c.us")).toBe(true);
    expect(progressos.at(-1)?.concluida).toBe(true);
  });

  it("respeita o checkpoint do pedido", async () => {
    const itens: ItemMensagem[] = [];
    await varrer(deps([]), {
      desde: new Date((AGORA_S - 2 * DIA) * 1000).toISOString(),
      aoItem: (i) => itens.push(i),
      aoProgresso: () => undefined,
      cancelada: () => false,
    });
    expect(itens.map((i) => i.wa_msg_id.split("_").pop())).toEqual(["C2"]);
  });

  it("cancela entre chats", async () => {
    let n = 0;
    const fim = await varrer(deps([]), {
      desde: null,
      aoItem: () => undefined,
      aoProgresso: () => undefined,
      cancelada: () => n++ >= 1,
    });
    expect(fim).toMatchObject({ chats_processados: 1, cancelada: true, concluida: false });
  });

  it("falha ao listar vira erro; falha num chat não para os outros", async () => {
    const d = deps([]);
    const erro = await varrer(
      { ...d, listarChatsIndividuais: async () => Promise.reject(new Error("sem WPP.chat")) },
      { desde: null, aoItem: () => undefined, aoProgresso: () => undefined, cancelada: () => false },
    );
    expect(erro.erro).toBe("sem WPP.chat");
    const itens: ItemMensagem[] = [];
    const parcial = await varrer(
      {
        ...d,
        carregarMensagensDesde: async (chatId, desde, limite) => {
          if (chatId === "556222222222@c.us") throw new Error("x");
          return d.carregarMensagensDesde(chatId, desde, limite);
        },
      },
      { desde: null, aoItem: (i) => itens.push(i), aoProgresso: () => undefined, cancelada: () => false },
    );
    expect(parcial).toMatchObject({ chats_processados: 3, concluida: true });
    expect(parcial.erro).toContain("1 chat");
    expect(itens).toHaveLength(4);
  });
});
