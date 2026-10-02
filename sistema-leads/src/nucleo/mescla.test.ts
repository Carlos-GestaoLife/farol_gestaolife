import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Tx } from "@/db";
import {
  estagios,
  eventos,
  filaRevisao,
  identificadores,
  mensagens,
  numeros,
  origens,
  pessoas,
  user,
  vendas,
} from "@/db/schema";
import { carregarPessoa } from "@/consultas/linha-do-tempo";
import { montarIdentificadores, resolverPessoa } from "./identidade";
import { ErroMescla, escolherEstagioMescla, mesclarPessoas, type EstagioMescla } from "./mescla";
import { celularAleatorio, emailAleatorio, emTransacaoDesfeita, temBanco } from "./teste/banco";

describe("escolherEstagioMescla", () => {
  const novo: EstagioMescla = { id: "novo", ordem: 1, tipo: "aberto" };
  const qualificado: EstagioMescla = { id: "qualificado", ordem: 3, tipo: "aberto" };
  const ganho: EstagioMescla = { id: "ganho", ordem: 8, tipo: "ganho" };
  const perdido: EstagioMescla = { id: "perdido", ordem: 9, tipo: "perdido" };

  it("fica o de maior ordem entre os abertos", () => {
    expect(escolherEstagioMescla(novo, qualificado, novo)).toBe(qualificado);
    expect(escolherEstagioMescla(qualificado, novo, novo)).toBe(qualificado);
  });

  it("ganho vence; perdido só se as duas forem perdidas", () => {
    expect(escolherEstagioMescla(perdido, ganho, novo)).toBe(ganho);
    expect(escolherEstagioMescla(qualificado, perdido, novo)).toBe(qualificado);
    expect(escolherEstagioMescla(perdido, perdido, novo)).toBe(perdido);
  });

  it("sem estágio conta como o inicial", () => {
    expect(escolherEstagioMescla(null, perdido, novo)).toBe(novo);
    expect(escolherEstagioMescla(null, null, novo)).toBe(novo);
    expect(escolherEstagioMescla(null, null, null)).toBeNull();
  });
});

describe.skipIf(!temBanco)("mesclarPessoas (integração)", () => {
  async function cenario(tx: Tx) {
    const usuarioId = randomUUID();
    await tx.insert(user).values({ id: usuarioId, name: "Gestão Teste", email: `${usuarioId}@exemplo.com.br`, papel: "gestao" });
    const est = new Map((await tx.select().from(estagios)).map((e) => [e.nome, e.id]));
    const telA = celularAleatorio().canonico;
    const telB = celularAleatorio();
    const emailA = emailAleatorio();
    const emailB = emailAleatorio();

    const a = await resolverPessoa(tx, montarIdentificadores({ telefone: telA, email: emailA }), { nomeExibicao: "Ana A" });
    const b = await resolverPessoa(tx, montarIdentificadores({ telefone: telB.canonico, email: emailB }), {
      nomeExibicao: "Ana B",
    });
    // Conflito: telefone de A e e-mail de B na mesma entrada.
    const c = await resolverPessoa(tx, montarIdentificadores({ telefone: telA, email: emailB }));
    expect(c).toMatchObject({ pessoaId: a.pessoaId, conflito: true });
    const [item] = await tx
      .select()
      .from(filaRevisao)
      .where(and(eq(filaRevisao.pessoaAId, a.pessoaId), eq(filaRevisao.pessoaBId, b.pessoaId)));
    expect(item.status).toBe("aberta");

    // A: Novo lead, sem responsável, contato em 10/09. B: Qualificado, com responsável, opt-out.
    const [origem] = await tx
      .insert(origens)
      .values({ codigo: `mescla-${randomUUID()}`, nome: "Origem mescla", tipo: "lp" })
      .returning({ id: origens.id });
    await tx
      .update(pessoas)
      .set({
        estagioId: est.get("Novo lead"),
        primeiroContatoEm: new Date("2026-09-10T12:00:00Z"),
        ultimoContatoEm: new Date("2026-09-10T12:00:00Z"),
      })
      .where(eq(pessoas.id, a.pessoaId));
    await tx
      .update(pessoas)
      .set({
        estagioId: est.get("Qualificado"),
        responsavelId: usuarioId,
        optOut: true,
        primeiroContatoEm: new Date("2026-09-01T12:00:00Z"),
        ultimoContatoEm: new Date("2026-09-20T12:00:00Z"),
      })
      .where(eq(pessoas.id, b.pessoaId));
    // B tem o toque mais antigo (com origem), 2 eventos, 2 mensagens e uma venda.
    await tx.insert(eventos).values([
      { pessoaId: b.pessoaId, tipo: "form_enviado", ocorridoEm: new Date("2026-09-01T12:00:00Z"), canal: "lp_form", origemId: origem.id },
      { pessoaId: b.pessoaId, tipo: "nota", ocorridoEm: new Date("2026-09-02T12:00:00Z"), canal: "manual", dados: { texto: "oi" } },
      { pessoaId: a.pessoaId, tipo: "nota", ocorridoEm: new Date("2026-09-10T12:00:00Z"), canal: "manual", dados: { texto: "a" } },
    ]);
    const numero = celularAleatorio().canonico;
    await tx.insert(numeros).values({ numero });
    await tx.insert(mensagens).values(
      ["in", "out"].map((direcao, i) => ({
        pessoaId: b.pessoaId,
        numeroMonitorado: numero,
        waMsgId: `msg-${randomUUID()}`,
        chatId: `${telB.canonico}@c.us`,
        direcao: direcao as "in" | "out",
        tipoMidia: "texto" as const,
        enviadaEm: new Date(Date.UTC(2026, 8, 20, 12, i)),
      })),
    );
    await tx.insert(vendas).values({
      pessoaId: b.pessoaId,
      produto: "Gestão PRO",
      valorCentavos: 100_00,
      canal: "online",
      fonte: "vendedor",
      ocorridaEm: new Date("2026-09-21T12:00:00Z"),
    });
    return { usuarioId, est, a: a.pessoaId, b: b.pessoaId, item: item.id, origem: origem.id, emailB, telB };
  }

  it("move tudo para a sobrevivente, marca a absorvida, grava o evento e resolve a fila", async () => {
    await emTransacaoDesfeita(async (tx) => {
      const s = await cenario(tx);
      const r = await mesclarPessoas(tx, {
        sobreviventeId: s.a,
        absorvidaId: s.b,
        usuarioId: s.usuarioId,
        filaRevisaoId: s.item,
      });
      expect(r).toMatchObject({
        jaEramAMesma: false,
        identificadoresMovidos: 2,
        eventosMovidos: 2,
        mensagensMovidas: 2,
        vendasMovidas: 1,
        avisos: [],
      });

      // Nada ficou na absorvida.
      for (const tabela of [identificadores, eventos, mensagens, vendas]) {
        const restantes = await tx.select().from(tabela).where(eq(tabela.pessoaId, s.b));
        expect(restantes).toHaveLength(0);
      }
      const ids = await tx.select().from(identificadores).where(eq(identificadores.pessoaId, s.a));
      expect(ids.map((i) => i.valor)).toEqual(expect.arrayContaining([s.emailB, s.telB.canonico]));

      // Absorvida marcada (não apagada); sobrevivente com o cache combinado.
      const [absorvida] = await tx.select().from(pessoas).where(eq(pessoas.id, s.b));
      expect(absorvida.mescladaParaId).toBe(s.a);
      expect(absorvida.mescladaEm).toBeInstanceOf(Date);
      const [sob] = await tx.select().from(pessoas).where(eq(pessoas.id, s.a));
      expect(sob).toMatchObject({
        nomeExibicao: "Ana A",
        estagioId: s.est.get("Qualificado"),
        responsavelId: s.usuarioId,
        optOut: true,
        origemPrimeiroToqueId: s.origem,
      });
      expect(sob.primeiroContatoEm?.toISOString()).toBe("2026-09-01T12:00:00.000Z");
      expect(sob.ultimoContatoEm?.toISOString()).toBe("2026-09-20T12:00:00.000Z");

      // Evento identidade_mesclada na sobrevivente.
      const [ev] = await tx
        .select()
        .from(eventos)
        .where(and(eq(eventos.pessoaId, s.a), eq(eventos.tipo, "identidade_mesclada")));
      expect(ev).toMatchObject({ canal: "manual", usuarioId: s.usuarioId, id: r.eventoId });
      expect(ev.dados).toMatchObject({
        absorvida_id: s.b,
        absorvida_nome: "Ana B",
        identificadores_movidos: 2,
        eventos_movidos: 2,
        mensagens_movidas: 2,
      });

      // Item da fila resolvido com quem e quando.
      const [item] = await tx.select().from(filaRevisao).where(eq(filaRevisao.id, s.item));
      expect(item).toMatchObject({ status: "resolvida", resolvidoPor: s.usuarioId });
      expect(item.resolvidoEm).toBeInstanceOf(Date);

      // Acessar a absorvida leva à sobrevivente.
      expect(await carregarPessoa(s.b, tx)).toEqual({ tipo: "mesclada", sobreviventeId: s.a });

      // Entrada nova com identificador da absorvida (e um novo) cai na sobrevivente.
      const novoEmail = emailAleatorio();
      const nova = await resolverPessoa(tx, montarIdentificadores({ telefone: s.telB.semNono, email: novoEmail }));
      expect(nova).toEqual({ pessoaId: s.a, criada: false, conflito: false });
    });
  });

  it("não mescla consigo mesma; já mesclada segue para a sobrevivente com aviso", async () => {
    await emTransacaoDesfeita(async (tx) => {
      const s = await cenario(tx);
      await expect(
        mesclarPessoas(tx, { sobreviventeId: s.a, absorvidaId: s.a, usuarioId: s.usuarioId }),
      ).rejects.toBeInstanceOf(ErroMescla);

      await mesclarPessoas(tx, { sobreviventeId: s.a, absorvidaId: s.b, usuarioId: s.usuarioId });

      // De novo, B em A: já são a mesma pessoa.
      const repetida = await mesclarPessoas(tx, { sobreviventeId: s.a, absorvidaId: s.b, usuarioId: s.usuarioId });
      expect(repetida).toMatchObject({ jaEramAMesma: true, eventoId: null });
      expect(repetida.avisos.length).toBeGreaterThan(0);

      // Uma terceira pessoa absorve B (já mesclada): na prática absorve A, com aviso.
      const c = await resolverPessoa(tx, montarIdentificadores({ email: emailAleatorio() }), { nomeExibicao: "C" });
      const r = await mesclarPessoas(tx, { sobreviventeId: c.pessoaId, absorvidaId: s.b, usuarioId: s.usuarioId });
      expect(r.absorvidaId).toBe(s.a);
      expect(r.avisos).toHaveLength(1);
      const [b] = await tx.select().from(pessoas).where(eq(pessoas.id, s.b));
      // Quem apontava para A passa a apontar direto para C.
      expect(b.mescladaParaId).toBe(c.pessoaId);
      expect(await carregarPessoa(s.a, tx)).toEqual({ tipo: "mesclada", sobreviventeId: c.pessoaId });
    });
  });

  it("itens abertos da absorvida passam para a sobrevivente", async () => {
    await emTransacaoDesfeita(async (tx) => {
      const s = await cenario(tx);
      // Conflito B x D aberto.
      const d = await resolverPessoa(tx, montarIdentificadores({ email: emailAleatorio() }), { nomeExibicao: "D" });
      const [outro] = await tx
        .insert(filaRevisao)
        .values({ tipo: "conflito_identidade", pessoaAId: s.b, pessoaBId: d.pessoaId, status: "aberta" })
        .returning({ id: filaRevisao.id });
      await mesclarPessoas(tx, { sobreviventeId: s.a, absorvidaId: s.b, usuarioId: s.usuarioId });
      const [item] = await tx.select().from(filaRevisao).where(eq(filaRevisao.id, outro.id));
      expect(item).toMatchObject({ pessoaAId: s.a, pessoaBId: d.pessoaId, status: "aberta" });
      // O item A x B (sem filaRevisaoId informado) também foi resolvido: virou par da mesma pessoa.
      const [ab] = await tx.select().from(filaRevisao).where(eq(filaRevisao.id, s.item));
      expect(ab.status).toBe("resolvida");
    });
  });
});
