import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { celularAleatorio, temBanco } from "@/nucleo/teste/banco";
import { db } from "@/db";
import { estagios, eventos, mensagens, numeros, origens, pessoas } from "@/db/schema";
import {
  conversaoPorEstagio,
  leadsPorCidade,
  leadsPorDia,
  leadsPorOrigem,
  leadsSemResposta,
  primeiraRespostaPorNumero,
  primeiroEUltimoToquePorOrigem,
  type FiltrosPainel,
} from "./painel";

// Dados sintéticos num período antigo (março de 2001), que nenhum outro dado do banco usa.
const D = (dia: string, hora = "12:00") => new Date(`2001-03-${dia}T${hora}:00-03:00`);
const PERIODO: FiltrosPainel = {
  de: new Date("2001-03-01T00:00:00-03:00"),
  ate: new Date("2001-04-01T00:00:00-03:00"),
};

describe.skipIf(!temBanco)("Painel (integração)", () => {
  const marca = randomUUID().slice(0, 8);
  const numero = celularAleatorio().canonico;
  const pessoasCriadas: string[] = [];
  let origemX: string;
  let origemY: string;
  let est: Map<string, string>;
  let p1: string;
  let p2: string;
  let p3: string;
  let p4: string;

  async function novaPessoa(valores: Partial<typeof pessoas.$inferInsert>): Promise<string> {
    const [p] = await db.insert(pessoas).values(valores).returning({ id: pessoas.id });
    pessoasCriadas.push(p.id);
    return p.id;
  }

  async function evento(valores: typeof eventos.$inferInsert) {
    await db.insert(eventos).values(valores);
  }

  beforeAll(async () => {
    est = new Map((await db.select().from(estagios)).map((e) => [e.nome, e.id]));
    const criadas = await db
      .insert(origens)
      .values([
        { codigo: `painel-x-${marca}`, nome: `Painel X ${marca}`, tipo: "lp" },
        { codigo: `painel-y-${marca}`, nome: `Painel Y ${marca}`, tipo: "link_whatsapp", cidade: "CidadeY" },
      ])
      .returning({ id: origens.id });
    [origemX, origemY] = criadas.map((o) => o.id);
    await db.insert(numeros).values({ numero, apelido: `Teste ${marca}` });

    // P1: 1º toque X (form com cidade), último toque Y. Está em "Em conversa".
    p1 = await novaPessoa({
      nomeExibicao: "P1",
      estagioId: est.get("Em conversa"),
      origemPrimeiroToqueId: origemX,
      primeiroContatoEm: D("02"),
    });
    await evento({ pessoaId: p1, tipo: "form_enviado", ocorridoEm: D("02"), canal: "lp_form", origemId: origemX, dados: { cidade: "Cidadeteste" } });
    await evento({ pessoaId: p1, tipo: "conversa_iniciada", ocorridoEm: D("05"), canal: "whatsapp", origemId: origemY });
    await evento({
      pessoaId: p1,
      tipo: "estagio_alterado",
      ocorridoEm: D("05"),
      canal: "whatsapp",
      dados: { de: est.get("Novo lead"), para: est.get("Em conversa"), automatico: true },
    });

    // P2: 1º toque Y, venda, depois toque X: o último toque é Y (antes da venda). Em "Qualificado".
    p2 = await novaPessoa({
      nomeExibicao: "P2",
      estagioId: est.get("Qualificado"),
      origemPrimeiroToqueId: origemY,
      primeiroContatoEm: D("03"),
    });
    await evento({ pessoaId: p2, tipo: "conversa_iniciada", ocorridoEm: D("03"), canal: "whatsapp", origemId: origemY });
    await evento({ pessoaId: p2, tipo: "venda_registrada", ocorridoEm: D("04"), canal: "manual" });
    await evento({ pessoaId: p2, tipo: "form_enviado", ocorridoEm: D("10"), canal: "lp_form", origemId: origemX });
    for (const para of ["Em conversa", "Qualificado"]) {
      await evento({ pessoaId: p2, tipo: "estagio_alterado", ocorridoEm: D("06"), canal: "manual", dados: { para: est.get(para) } });
    }

    // P3: só X, cidade em campos (Meta). Em "Novo lead".
    p3 = await novaPessoa({
      nomeExibicao: "P3",
      estagioId: est.get("Novo lead"),
      origemPrimeiroToqueId: origemX,
      primeiroContatoEm: D("03"),
    });
    await evento({ pessoaId: p3, tipo: "form_enviado", ocorridoEm: D("03"), canal: "meta_form", origemId: origemX, dados: { campos: { cidade: "Outra" } } });

    // P4: sem origem e sem estágio (conta no primeiro estágio).
    p4 = await novaPessoa({ nomeExibicao: "P4", primeiroContatoEm: D("20") });

    // Mesclada (não conta) e pessoa fora do período (não conta).
    await novaPessoa({ nomeExibicao: "Mesclada", primeiroContatoEm: D("02"), origemPrimeiroToqueId: origemX, mescladaParaId: p1, mescladaEm: D("10") });
    await novaPessoa({ nomeExibicao: "Fora", primeiroContatoEm: new Date("2001-04-05T12:00:00-03:00"), origemPrimeiroToqueId: origemX });

    // Mensagens (todas do P1) para o tempo de primeira resposta.
    const msg = (chat: string, direcao: "in" | "out", em: Date) => ({
      pessoaId: p1,
      numeroMonitorado: numero,
      waMsgId: `${marca}-${randomUUID()}`,
      chatId: `${chat}-${marca}@c.us`,
      direcao,
      tipoMidia: "texto" as const,
      enviadaEm: em,
    });
    await db.insert(mensagens).values([
      // c1: 5 min (a segunda recebida não conta).
      msg("c1", "in", D("02", "10:00")),
      msg("c1", "in", D("02", "10:01")),
      msg("c1", "out", D("02", "10:05")),
      // c2: 15 min.
      msg("c2", "in", D("03", "10:00")),
      msg("c2", "out", D("03", "10:15")),
      // c3: sem resposta.
      msg("c3", "in", D("04", "10:00")),
      // c4: primeira recebida antes do período: fica de fora.
      msg("c4", "in", new Date("2001-02-15T10:00:00-03:00")),
      msg("c4", "out", D("02", "10:00")),
      // c5: enviada antes da recebida não conta; 10 min.
      msg("c5", "out", D("05", "09:00")),
      msg("c5", "in", D("05", "09:30")),
      msg("c5", "out", D("05", "09:40")),
    ]);
  });

  afterAll(async () => {
    await db.delete(mensagens).where(eq(mensagens.numeroMonitorado, numero));
    if (pessoasCriadas.length) {
      await db.delete(eventos).where(inArray(eventos.pessoaId, pessoasCriadas));
      await db.delete(pessoas).where(and(inArray(pessoas.id, pessoasCriadas), isNotNull(pessoas.mescladaParaId)));
      await db.delete(pessoas).where(inArray(pessoas.id, pessoasCriadas));
    }
    await db.delete(numeros).where(eq(numeros.numero, numero));
    if (origemX) await db.delete(origens).where(inArray(origens.id, [origemX, origemY]));
  });

  it("1. leads por origem do primeiro toque, ordenados, sem mescladas e só do período", async () => {
    const r = await leadsPorOrigem(PERIODO);
    expect(r).toEqual([
      { origemId: origemX, nome: `Painel X ${marca}`, total: 2 },
      { origemId: origemY, nome: `Painel Y ${marca}`, total: 1 },
      { origemId: null, nome: "Sem origem", total: 1 },
    ]);
    expect(await leadsPorOrigem({ ...PERIODO, origemId: origemY })).toEqual([
      { origemId: origemY, nome: `Painel Y ${marca}`, total: 1 },
    ]);
  });

  it("2 e 3. cidade (formulário, senão origem) e série por dia", async () => {
    const cidades = await leadsPorCidade(PERIODO);
    expect(cidades).toEqual(
      expect.arrayContaining([
        { cidade: "Cidadeteste", total: 1 },
        { cidade: "CidadeY", total: 1 },
        { cidade: "Outra", total: 1 },
        { cidade: null, total: 1 },
      ]),
    );
    expect(await leadsPorOrigem({ ...PERIODO, cidade: "cidadeteste" })).toEqual([
      { origemId: origemX, nome: `Painel X ${marca}`, total: 1 },
    ]);
    const dias = await leadsPorDia(PERIODO);
    expect(dias).toHaveLength(31);
    expect(dias[0]).toEqual({ dia: "2001-03-01", total: 0 });
    expect(dias.find((d) => d.dia === "2001-03-03")?.total).toBe(2);
    expect(dias.reduce((s, d) => s + d.total, 0)).toBe(4);
  });

  it("4. primeiro x último toque por origem (último antes da venda)", async () => {
    const r = await primeiroEUltimoToquePorOrigem(PERIODO);
    expect(r).toEqual([
      { origemId: origemX, nome: `Painel X ${marca}`, primeiro: 2, ultimo: 1 },
      { origemId: origemY, nome: `Painel Y ${marca}`, primeiro: 1, ultimo: 2 },
    ]);
  });

  it("5. conversão por estágio: hoje e quem passou, com percentual", async () => {
    const r = await conversaoPorEstagio(PERIODO);
    expect(r.totalLeads).toBe(4);
    const por = new Map(r.estagios.map((e) => [e.nome, e]));
    expect(por.get("Novo lead")).toMatchObject({ hoje: 2, passaram: 4, percentual: 1 });
    expect(por.get("Em conversa")).toMatchObject({ hoje: 1, passaram: 2, percentual: 0.5 });
    expect(por.get("Qualificado")).toMatchObject({ hoje: 1, passaram: 1, percentual: 0.25 });
    expect(por.get("Reunião agendada")).toMatchObject({ hoje: 0, passaram: 0, percentual: 0 });
    // Ordem do funil.
    expect(r.estagios.map((e) => e.ordem)).toEqual([...r.estagios.map((e) => e.ordem)].sort((a, b) => a - b));
  });

  it("6. tempo de primeira resposta por número: média, mediana e sem resposta", async () => {
    const r = await primeiraRespostaPorNumero(PERIODO);
    const linha = r.find((l) => l.numeroMonitorado === numero);
    expect(linha).toEqual({
      numeroMonitorado: numero,
      apelido: `Teste ${marca}`,
      chats: 4,
      respondidos: 3,
      semResposta: 1,
      mediaMs: 10 * 60_000,
      medianaMs: 10 * 60_000,
    });
    // Filtro de origem: as mensagens são do P1 (origem X); com a origem Y não sobra nada.
    const soY = await primeiraRespostaPorNumero({ ...PERIODO, origemId: origemY });
    expect(soY.find((l) => l.numeroMonitorado === numero)).toBeUndefined();
  });

  it("7. leads sem resposta: P1 espera desde a mensagem do chat c3", async () => {
    const r = await leadsSemResposta({ ...PERIODO, origemId: origemX });
    const p = r.find((l) => l.pessoaId === p1);
    expect(p?.aguardandoDesde.toISOString()).toBe(D("04", "10:00").toISOString());
    expect(r.some((l) => [p2, p3, p4].includes(l.pessoaId))).toBe(false);
  });
});
