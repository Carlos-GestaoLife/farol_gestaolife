import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { celularAleatorio, emailAleatorio, temBanco } from "@/nucleo/teste/banco";
import { db } from "@/db";
import {
  entradasBrutas,
  estagios,
  eventos,
  identificadores,
  mensagens,
  numeros,
  pessoas,
  user,
} from "@/db/schema";
import { processarEntrada, registrarEntradas } from "@/nucleo/entradas";
import {
  adicionarNotaManual,
  alterarOptOutManual,
  alterarResponsavelManual,
  moverEstagioManual,
} from "@/nucleo/pessoa-manual";
import { aguardandoRespostaPorPessoa, carregarKanban } from "./kanban";
import { carregarLinhaDoTempo, carregarPessoa } from "./linha-do-tempo";
import { listarPessoas } from "./pessoas";

const MIN = 60_000;

describe.skipIf(!temBanco)("telas Leads, Pessoa e Kanban (integração)", () => {
  const marca = `Teste ${randomUUID().slice(0, 8)}`;
  const pessoasCriadas: string[] = [];
  const usuarios: string[] = [];
  const chavesEntradas: string[] = [];
  const numero = celularAleatorio().canonico;
  let estagioPorNome: Map<string, typeof estagios.$inferSelect>;
  let usuarioA: string;
  let usuarioB: string;

  async function novoUsuario(nome: string): Promise<string> {
    const id = randomUUID();
    await db.insert(user).values({ id, name: nome, email: `${id}@exemplo.com.br`, papel: "comercial" });
    usuarios.push(id);
    return id;
  }

  async function novaPessoa(nome: string, extra: Partial<typeof pessoas.$inferInsert> = {}) {
    const [p] = await db
      .insert(pessoas)
      .values({
        nomeExibicao: nome,
        estagioId: estagioPorNome.get("Novo lead")!.id,
        primeiroContatoEm: new Date(),
        ultimoContatoEm: new Date(),
        ...extra,
      })
      .returning();
    pessoasCriadas.push(p.id);
    return p;
  }

  async function eventosDe(pessoaId: string) {
    return db.select().from(eventos).where(eq(eventos.pessoaId, pessoaId));
  }

  beforeAll(async () => {
    estagioPorNome = new Map((await db.select().from(estagios)).map((e) => [e.nome, e]));
    usuarioA = await novoUsuario(`${marca} Ana`);
    usuarioB = await novoUsuario(`${marca} Bruno`);
    await db.insert(numeros).values({ numero }).onConflictDoNothing();
  });

  afterAll(async () => {
    if (chavesEntradas.length) {
      const entradas = await db
        .select({ id: entradasBrutas.id })
        .from(entradasBrutas)
        .where(and(eq(entradasBrutas.fonte, "manual"), inArray(entradasBrutas.chaveIdempotencia, chavesEntradas)));
      const ids = entradas.map((e) => e.id);
      if (ids.length) {
        const ev = await db
          .select({ pessoaId: eventos.pessoaId })
          .from(eventos)
          .where(inArray(eventos.entradaBrutaId, ids));
        pessoasCriadas.push(...ev.map((e) => e.pessoaId));
      }
      if (ids.length) {
        await db.delete(eventos).where(inArray(eventos.entradaBrutaId, ids));
      }
    }
    const ps = [...new Set(pessoasCriadas)];
    await db.delete(mensagens).where(eq(mensagens.numeroMonitorado, numero));
    if (ps.length) {
      await db.delete(eventos).where(inArray(eventos.pessoaId, ps));
      await db.delete(identificadores).where(inArray(identificadores.pessoaId, ps));
      // Primeiro as mescladas (apontam para as sobreviventes).
      await db.delete(pessoas).where(and(inArray(pessoas.id, ps), isNotNull(pessoas.mescladaParaId)));
      await db.delete(pessoas).where(inArray(pessoas.id, ps));
    }
    if (chavesEntradas.length) {
      await db
        .delete(entradasBrutas)
        .where(and(eq(entradasBrutas.fonte, "manual"), inArray(entradasBrutas.chaveIdempotencia, chavesEntradas)));
    }
    await db.delete(numeros).where(eq(numeros.numero, numero));
    if (usuarios.length) await db.delete(user).where(inArray(user.id, usuarios));
  });

  it("moverEstagio grava UPDATE e evento estagio_alterado com de/para, usuário e hora", async () => {
    const p = await novaPessoa(`${marca} Mover`);
    const qualificado = estagioPorNome.get("Qualificado")!;
    const antes = Date.now();

    const r = await moverEstagioManual({ pessoaId: p.id, estagioId: qualificado.id, usuarioId: usuarioA });
    expect(r).toEqual({ ok: true, alterado: true });

    const [depois] = await db.select().from(pessoas).where(eq(pessoas.id, p.id));
    expect(depois.estagioId).toBe(qualificado.id);
    const [ev] = await eventosDe(p.id);
    expect(ev).toMatchObject({ tipo: "estagio_alterado", canal: "manual", usuarioId: usuarioA, entradaBrutaId: null });
    expect(ev.dados).toMatchObject({
      de: estagioPorNome.get("Novo lead")!.id,
      para: qualificado.id,
      de_nome: "Novo lead",
      para_nome: "Qualificado",
      automatico: false,
    });
    expect(ev.ocorridoEm.getTime()).toBeGreaterThanOrEqual(antes - 1000);

    // Manual pode voltar (para trás); mesmo estágio não grava nada.
    expect(
      await moverEstagioManual({ pessoaId: p.id, estagioId: estagioPorNome.get("Novo lead")!.id, usuarioId: usuarioA }),
    ).toEqual({ ok: true, alterado: true });
    expect(
      await moverEstagioManual({ pessoaId: p.id, estagioId: estagioPorNome.get("Novo lead")!.id, usuarioId: usuarioA }),
    ).toEqual({ ok: true, alterado: false });
    expect(await eventosDe(p.id)).toHaveLength(2);
  });

  it("Perdido sem motivo falha; com motivo grava na pessoa e no evento; sair de Perdido limpa o motivo", async () => {
    const p = await novaPessoa(`${marca} Perdido`);
    const perdido = estagioPorNome.get("Perdido")!;

    expect(
      await moverEstagioManual({ pessoaId: p.id, estagioId: perdido.id, usuarioId: usuarioA, motivoPerda: "   " }),
    ).toEqual({ ok: false, erro: "Informe o motivo da perda" });
    let [atual] = await db.select().from(pessoas).where(eq(pessoas.id, p.id));
    expect(atual.estagioId).toBe(estagioPorNome.get("Novo lead")!.id);
    expect(await eventosDe(p.id)).toHaveLength(0);

    expect(
      await moverEstagioManual({ pessoaId: p.id, estagioId: perdido.id, usuarioId: usuarioA, motivoPerda: "Achou caro" }),
    ).toEqual({ ok: true, alterado: true });
    [atual] = await db.select().from(pessoas).where(eq(pessoas.id, p.id));
    expect(atual).toMatchObject({ estagioId: perdido.id, motivoPerda: "Achou caro" });
    const [ev] = await eventosDe(p.id);
    expect(ev.dados).toMatchObject({ para_nome: "Perdido", motivo_perda: "Achou caro" });

    await moverEstagioManual({ pessoaId: p.id, estagioId: estagioPorNome.get("Negociação")!.id, usuarioId: usuarioB });
    [atual] = await db.select().from(pessoas).where(eq(pessoas.id, p.id));
    expect(atual.motivoPerda).toBeNull();
  });

  it("alterarResponsavel grava evento responsavel_alterado com ids e nomes", async () => {
    const p = await novaPessoa(`${marca} Responsavel`);
    expect(await alterarResponsavelManual({ pessoaId: p.id, responsavelId: usuarioA, usuarioId: usuarioB })).toEqual({
      ok: true,
      alterado: true,
    });
    expect(await alterarResponsavelManual({ pessoaId: p.id, responsavelId: usuarioB, usuarioId: usuarioB })).toEqual({
      ok: true,
      alterado: true,
    });
    expect(
      await alterarResponsavelManual({ pessoaId: p.id, responsavelId: "nao-existe", usuarioId: usuarioB }),
    ).toEqual({ ok: false, erro: "Usuário não encontrado" });

    const [atual] = await db.select().from(pessoas).where(eq(pessoas.id, p.id));
    expect(atual.responsavelId).toBe(usuarioB);
    const evs = (await eventosDe(p.id)).sort((a, b) => a.registradoEm.getTime() - b.registradoEm.getTime());
    expect(evs.map((e) => e.tipo)).toEqual(["responsavel_alterado", "responsavel_alterado"]);
    expect(evs[0]).toMatchObject({ canal: "manual", usuarioId: usuarioB });
    expect(evs[0].dados).toMatchObject({ de: null, para: usuarioA, de_nome: null, para_nome: `${marca} Ana` });
    expect(evs[1].dados).toMatchObject({ de: usuarioA, para: usuarioB, de_nome: `${marca} Ana`, para_nome: `${marca} Bruno` });
  });

  it("nota e opt-out viram eventos nota e aparecem na linha do tempo com o autor", async () => {
    const p = await novaPessoa(`${marca} Nota`);
    await adicionarNotaManual({ pessoaId: p.id, texto: "Pediu retorno", usuarioId: usuarioA });
    await alterarOptOutManual({ pessoaId: p.id, optOut: true, usuarioId: usuarioA });
    const [atual] = await db.select().from(pessoas).where(eq(pessoas.id, p.id));
    expect(atual.optOut).toBe(true);

    const { itens } = await carregarLinhaDoTempo(p.id);
    const titulos = itens.map((i) => (i.tipo === "evento" ? i.descricao : null));
    expect(titulos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ titulo: "Nota", detalhes: ["Pediu retorno"], autor: `por ${marca} Ana` }),
        expect.objectContaining({ titulo: "Nota", detalhes: ["Opt-out ativado"] }),
      ]),
    );
  });

  it("sem resposta: in sem out posterior conta desde a 1ª in não respondida; vazio quando a última é out ou sem mensagens", async () => {
    const t0 = new Date(Date.now() - 120 * MIN);
    const em = (min: number) => new Date(t0.getTime() + min * MIN);
    const esperando = await novaPessoa(`${marca} Esperando`);
    const respondida = await novaPessoa(`${marca} Respondida`);
    const voltou = await novaPessoa(`${marca} Voltou`);
    const semMensagens = await novaPessoa(`${marca} Sem mensagens`);

    const m = (pessoaId: string, chat: string, direcao: "in" | "out", enviadaEm: Date) => ({
      pessoaId,
      numeroMonitorado: numero,
      waMsgId: randomUUID(),
      chatId: chat,
      direcao,
      tipoMidia: "texto" as const,
      enviadaEm,
    });
    await db.insert(mensagens).values([
      m(esperando.id, "a@c.us", "in", em(0)),
      m(esperando.id, "a@c.us", "in", em(5)),
      m(respondida.id, "b@c.us", "in", em(0)),
      m(respondida.id, "b@c.us", "out", em(3)),
      m(voltou.id, "c@c.us", "in", em(0)),
      m(voltou.id, "c@c.us", "out", em(2)),
      m(voltou.id, "c@c.us", "in", em(30)),
      m(voltou.id, "c@c.us", "in", em(40)),
    ]);

    const mapa = await aguardandoRespostaPorPessoa([esperando.id, respondida.id, voltou.id, semMensagens.id]);
    expect(mapa.get(esperando.id)?.getTime()).toBe(em(0).getTime());
    expect(mapa.get(voltou.id)?.getTime()).toBe(em(30).getTime());
    expect(mapa.has(respondida.id)).toBe(false);
    expect(mapa.has(semMensagens.id)).toBe(false);

    // O kanban usa o mesmo cálculo.
    const colunas = await carregarKanban({ busca: marca });
    const cartoes = colunas.flatMap((c) => c.cartoes);
    expect(cartoes.find((c) => c.id === esperando.id)?.aguardandoDesde?.getTime()).toBe(em(0).getTime());
    expect(cartoes.find((c) => c.id === respondida.id)?.aguardandoDesde).toBeNull();

    // Linha do tempo: mensagens agregadas por dia.
    const { itens } = await carregarLinhaDoTempo(respondida.id);
    const dia = itens.find((i) => i.tipo === "mensagens");
    expect(dia && dia.tipo === "mensagens" ? dia.resumo : null).toBe("1 recebida, 1 enviada, 1ª resposta em 3 min");
  });

  it("pessoa mesclada não aparece em listarPessoas nem no kanban; a ficha aponta para a sobrevivente", async () => {
    const tel = celularAleatorio();
    const sobrevivente = await novaPessoa(`${marca} Sobrevivente`);
    const mesclada = await novaPessoa(`${marca} Mesclada`, {
      mescladaParaId: sobrevivente.id,
      mescladaEm: new Date(),
    });
    await db.insert(identificadores).values({ pessoaId: sobrevivente.id, tipo: "telefone", valor: tel.canonico });

    const { linhas, total } = await listarPessoas({ busca: marca }, { porPagina: 500 });
    const ids = linhas.map((l) => l.id);
    expect(ids).toContain(sobrevivente.id);
    expect(ids).not.toContain(mesclada.id);
    expect(total).toBe(linhas.length);

    const kanban = (await carregarKanban({ busca: marca })).flatMap((c) => c.cartoes.map((x) => x.id));
    expect(kanban).toContain(sobrevivente.id);
    expect(kanban).not.toContain(mesclada.id);

    expect(await carregarPessoa(mesclada.id)).toEqual({ tipo: "mesclada", sobreviventeId: sobrevivente.id });
    expect(await moverEstagioManual({
      pessoaId: mesclada.id,
      estagioId: estagioPorNome.get("Qualificado")!.id,
      usuarioId: usuarioA,
    })).toMatchObject({ ok: false });

    // Busca por telefone no formato antigo (sem o nono dígito) acha pela forma canônica.
    const porTelefone = await listarPessoas({ busca: tel.semNono });
    expect(porTelefone.linhas.map((l) => l.id)).toEqual([sobrevivente.id]);
    expect(porTelefone.linhas[0].telefone).toBe(tel.canonico);
  });

  it("filtros de estágio, responsável e cidade (último form_enviado com cidade)", async () => {
    const p = await novaPessoa(`${marca} Cidade`, { responsavelId: usuarioA });
    await db.insert(eventos).values([
      { pessoaId: p.id, tipo: "form_enviado", canal: "lp_form", ocorridoEm: new Date(Date.now() - 2 * MIN), dados: { cidade: "Maceió" } },
      { pessoaId: p.id, tipo: "form_enviado", canal: "meta_form", ocorridoEm: new Date(Date.now() - MIN), dados: { campos: { cidade: "Goiânia" } } },
      { pessoaId: p.id, tipo: "form_enviado", canal: "lp_form", ocorridoEm: new Date(), dados: { cidade: "" } },
    ]);
    const [linha] = (await listarPessoas({ busca: `${marca} Cidade` })).linhas;
    expect(linha).toMatchObject({ id: p.id, cidade: "Goiânia", responsavelNome: `${marca} Ana`, estagioNome: "Novo lead" });

    expect((await listarPessoas({ busca: marca, cidade: "goiân" })).linhas.map((l) => l.id)).toEqual([p.id]);
    expect((await listarPessoas({ busca: marca, cidade: "Maceió" })).total).toBe(0);
    expect((await listarPessoas({ busca: marca, responsavelId: usuarioA })).linhas.map((l) => l.id)).toContain(p.id);
    expect(
      (await listarPessoas({ busca: marca, estagioId: estagioPorNome.get("Perdido")!.id })).linhas.map((l) => l.id),
    ).not.toContain(p.id);
  });

  it("Novo lead pelo pipeline manual: estágio Novo lead, evento nota com o usuário e datas de contato", async () => {
    const email = emailAleatorio();
    const chave = `manual:${randomUUID()}`;
    chavesEntradas.push(chave);
    const {
      aceitas: [entrada],
    } = await registrarEntradas([
      { fonte: "manual", chaveIdempotencia: chave, payload: { nome: `${marca} Manual`, email, usuarioId: usuarioA } },
    ]);
    expect((await processarEntrada(entrada.id)).status).toBe("processado");

    const [ev] = await db.select().from(eventos).where(eq(eventos.entradaBrutaId, entrada.id));
    expect(ev).toMatchObject({ tipo: "nota", canal: "manual", usuarioId: usuarioA });
    expect(ev.dados).toMatchObject({ texto: null, lead_manual: true });
    const [p] = await db.select().from(pessoas).where(eq(pessoas.id, ev.pessoaId));
    expect(p.estagioId).toBe(estagioPorNome.get("Novo lead")!.id);
    expect(p.ultimoContatoEm).not.toBeNull();
    expect(p.primeiroContatoEm).not.toBeNull();
  });
});
