import { describe, expect, it } from "vitest";
import {
  agregarMensagensPorDia,
  descreverDiaMensagens,
  descreverEvento,
  type MensagemResumo,
} from "./linha-do-tempo";

const NUM_A = "5562999990001";
const NUM_B = "5562999990002";

function msg(
  enviadaEm: string,
  direcao: "in" | "out",
  extra: Partial<MensagemResumo> = {},
): MensagemResumo {
  return {
    numeroMonitorado: NUM_A,
    chatId: "5562988887777@c.us",
    direcao,
    enviadaEm: new Date(enviadaEm),
    ...extra,
  };
}

describe("agregarMensagensPorDia", () => {
  it("conta recebidas e enviadas e calcula a 1ª resposta (primeira in do dia até a primeira out posterior)", () => {
    const dias = agregarMensagensPorDia([
      msg("2026-10-02T12:00:00Z", "in", { textoAbertura: "Quero saber do evento" }),
      msg("2026-10-02T12:01:00Z", "in"),
      msg("2026-10-02T12:04:00Z", "out"),
      msg("2026-10-02T12:10:00Z", "out"),
      msg("2026-10-02T13:00:00Z", "in"),
    ]);
    expect(dias).toHaveLength(1);
    expect(dias[0]).toMatchObject({
      dia: "2026-10-02",
      numeroMonitorado: NUM_A,
      recebidas: 3,
      enviadas: 2,
      primeiraRespostaMs: 4 * 60_000,
      semResposta: false,
      textosAbertura: ["Quero saber do evento"],
    });
    expect(descreverDiaMensagens(dias[0])).toBe("3 recebidas, 2 enviadas, 1ª resposta em 4 min");
  });

  it("separa por dia de Brasília e por número monitorado, mais recente primeiro", () => {
    const dias = agregarMensagensPorDia([
      // 01:00 UTC do dia 3 = 22:00 do dia 2 em Brasília.
      msg("2026-10-03T01:00:00Z", "in"),
      msg("2026-10-03T13:00:00Z", "in"),
      msg("2026-10-03T13:30:00Z", "out"),
      msg("2026-10-03T14:00:00Z", "out", { numeroMonitorado: NUM_B, chatId: "outro@c.us" }),
    ]);
    expect(dias.map((d) => [d.dia, d.numeroMonitorado])).toEqual([
      ["2026-10-03", NUM_B],
      ["2026-10-03", NUM_A],
      ["2026-10-02", NUM_A],
    ]);
    // A in das 22h do dia 2 foi respondida no dia seguinte (mesmo chat): 1ª resposta em 12 h 30.
    expect(dias[2]).toMatchObject({ recebidas: 1, enviadas: 0, primeiraRespostaMs: 12.5 * 3_600_000 });
    expect(descreverDiaMensagens(dias[2])).toBe("1 recebida, 0 enviadas, 1ª resposta em 12 h");
    // Dia só com enviada: nem 1ª resposta nem "sem resposta".
    expect(dias[0]).toMatchObject({ recebidas: 0, enviadas: 1, primeiraRespostaMs: null, semResposta: false });
    expect(descreverDiaMensagens(dias[0])).toBe("0 recebidas, 1 enviada");
  });

  it("sem out posterior no mesmo chat: sem resposta (out de outro chat não conta)", () => {
    const dias = agregarMensagensPorDia([
      msg("2026-10-02T12:00:00Z", "out"),
      msg("2026-10-02T12:05:00Z", "in"),
      msg("2026-10-02T12:06:00Z", "out", { chatId: "outro@c.us" }),
    ]);
    expect(dias[0]).toMatchObject({ recebidas: 1, enviadas: 2, primeiraRespostaMs: null, semResposta: true });
    expect(descreverDiaMensagens(dias[0])).toBe("1 recebida, 2 enviadas, sem resposta");
  });

  it("lista vazia não gera dias e a entrada não é alterada", () => {
    expect(agregarMensagensPorDia([])).toEqual([]);
    const entrada = [msg("2026-10-02T13:00:00Z", "out"), msg("2026-10-02T12:00:00Z", "in")];
    agregarMensagensPorDia(entrada);
    expect(entrada[0].direcao).toBe("out");
  });
});

describe("descreverEvento", () => {
  it("estágio manual com motivo e autor", () => {
    const d = descreverEvento({
      tipo: "estagio_alterado",
      canal: "manual",
      dados: { de: "a", para: "b", de_nome: "Novo lead", para_nome: "Perdido", motivo_perda: "Achou caro" },
      usuarioNome: "Carlos",
    });
    expect(d.titulo).toBe("Estágio alterado de Novo lead para Perdido");
    expect(d.detalhes).toEqual(["Motivo da perda: Achou caro"]);
    expect(d.autor).toBe("por Carlos");
  });

  it("estágio automático sem estágio anterior", () => {
    const d = descreverEvento({
      tipo: "estagio_alterado",
      canal: "whatsapp",
      dados: { de: null, para: "x", para_nome: "Em conversa", automatico: true },
    });
    expect(d.titulo).toBe("Entrou no estágio Em conversa");
    expect(d.detalhes).toContain("Movimento automático");
    expect(d.detalhes).toContain("Canal: WhatsApp");
    expect(d.autor).toBeUndefined();
  });

  it("responsável (com ninguém), nota, nota antiga e lead manual", () => {
    expect(
      descreverEvento({
        tipo: "responsavel_alterado",
        canal: "manual",
        dados: { de: null, para: "u1", de_nome: null, para_nome: "Ana" },
        usuarioNome: "Bia",
      }),
    ).toMatchObject({ titulo: "Responsável alterado de ninguém para Ana", autor: "por Bia" });
    expect(descreverEvento({ tipo: "nota", canal: "manual", dados: { texto: "Ligar amanhã" } })).toMatchObject({
      titulo: "Nota",
      detalhes: ["Ligar amanhã"],
    });
    expect(descreverEvento({ tipo: "nota", canal: "manual", dados: { nota: "Formato antigo" } }).detalhes).toEqual([
      "Formato antigo",
    ]);
    expect(
      descreverEvento({ tipo: "nota", canal: "manual", dados: { texto: null, lead_manual: true } }).titulo,
    ).toBe("Lead cadastrado manualmente");
  });

  it("formulários, conversa com texto de abertura e demais tipos", () => {
    const lp = descreverEvento({
      tipo: "form_enviado",
      canal: "lp_form",
      dados: { cidade: "Maceió", utm_campaign: "gnv-maceio" },
      origemNome: "LP Maceió",
    });
    expect(lp.titulo).toBe("Formulário da LP enviado");
    expect(lp.detalhes).toEqual(["Origem: LP Maceió", "Cidade: Maceió", "Campanha (UTM): gnv-maceio"]);
    const meta = descreverEvento({ tipo: "form_enviado", canal: "meta_form", dados: { campos: { cidade: "Goiânia" } } });
    expect(meta).toMatchObject({ titulo: "Formulário da Meta enviado", detalhes: ["Cidade: Goiânia"] });
    const conversa = descreverEvento({
      tipo: "conversa_iniciada",
      canal: "whatsapp",
      numeroMonitorado: "5562999998888",
      dados: { texto_abertura: "Olá, quero saber do evento" },
    });
    expect(conversa).toMatchObject({
      titulo: "Conversa iniciada no WhatsApp",
      detalhes: ["Número: +55 62 99999-8888"],
      textoAbertura: "Olá, quero saber do evento",
    });
    expect(descreverEvento({ tipo: "ingresso_comprado", canal: "hotmart", dados: null }).titulo).toBe(
      "Ingresso comprado",
    );
    expect(
      descreverEvento({ tipo: "venda_registrada", canal: "presencial", dados: { produto: "Gestão PRO", valor_centavos: 150000 } })
        .detalhes,
    ).toEqual(["Produto: Gestão PRO", expect.stringMatching(/^Valor: R\$\s1\.500,00$/), "Canal: presencial"]);
    expect(descreverEvento({ tipo: "checkin_evento", canal: null, dados: {} }).titulo).toBe("Check-in no evento");
    expect(descreverEvento({ tipo: "reuniao_agendada", canal: null, dados: {} }).titulo).toBe("Reunião agendada");
    expect(descreverEvento({ tipo: "identidade_mesclada", canal: "manual", dados: {} }).titulo).toBe(
      "Identidade mesclada",
    );    expect(
      descreverEvento({
        tipo: "identidade_mesclada",
        canal: "manual",
        dados: { absorvida_nome: "Maria", identificadores_movidos: 2, eventos_movidos: 3, mensagens_movidas: 4 },
      }).detalhes,
    ).toEqual(["Absorveu a pessoa Maria", "Movidos: 2 identificadores, 3 eventos, 4 mensagens"]);
  });
});
