import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { celularAleatorio, temBanco } from "./teste/banco";
import { db } from "@/db";
import { entradasBrutas, eventos, filaRevisao, identificadores, pessoas } from "@/db/schema";
import {
  chaveSha256,
  jsonEstavel,
  processarEntrada,
  processarPendentes,
  registrarEntradas,
  registrarProcessador,
  removerProcessador,
} from "./entradas";

describe("chaveSha256", () => {
  it("é estável para a mesma estrutura com chaves em outra ordem", () => {
    const a = { nome: "Maria", utm: { source: "ig", campaign: "x" }, lista: [1, { b: 2, a: 1 }] };
    const b = { lista: [1, { a: 1, b: 2 }], utm: { campaign: "x", source: "ig" }, nome: "Maria" };
    expect(jsonEstavel(a)).toBe(jsonEstavel(b));
    expect(chaveSha256(a)).toBe(chaveSha256(b));
    expect(chaveSha256(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(chaveSha256({ ...a, nome: "João" })).not.toBe(chaveSha256(a));
  });
});

describe("registrarEntradas: validação", () => {
  it("rejeita mais de 100 itens", async () => {
    const itens = Array.from({ length: 101 }, (_, i) => ({
      fonte: "outra" as const,
      chaveIdempotencia: `x-${i}`,
      payload: {},
    }));
    await expect(registrarEntradas(itens)).rejects.toThrow();
  });

  it("rejeita fonte desconhecida e chave vazia", async () => {
    await expect(
      registrarEntradas([{ fonte: "email" as never, chaveIdempotencia: "a", payload: {} }]),
    ).rejects.toThrow();
    await expect(
      registrarEntradas([{ fonte: "outra", chaveIdempotencia: "  ", payload: {} }]),
    ).rejects.toThrow();
  });
});

describe.skipIf(!temBanco)("entradas (integração)", () => {
  const prefixo = `teste-${randomUUID()}`;
  const telefones: string[] = [];
  const chavesUsadas: string[] = [];
  const chave = (nome: string) => {
    const c = `${prefixo}-${nome}`;
    chavesUsadas.push(c);
    return c;
  };

  afterEach(() => removerProcessador("outra"));

  afterAll(async () => {
    // Limpa tudo o que os testes gravaram (entradas, eventos, identificadores e pessoas).
    const entradas = await db
      .select({ id: entradasBrutas.id })
      .from(entradasBrutas)
      .where(inArray(entradasBrutas.chaveIdempotencia, chavesUsadas));
    const idsEntradas = entradas.map((e) => e.id);
    const donos = telefones.length
      ? await db
          .select({ pessoaId: identificadores.pessoaId })
          .from(identificadores)
          .where(inArray(identificadores.valor, telefones))
      : [];
    const idsPessoas = [...new Set(donos.map((d) => d.pessoaId))];
    if (idsEntradas.length) {
      await db.delete(eventos).where(inArray(eventos.entradaBrutaId, idsEntradas));
      await db.delete(filaRevisao).where(inArray(filaRevisao.entradaBrutaId, idsEntradas));
    }
    if (idsPessoas.length) {
      await db.delete(eventos).where(inArray(eventos.pessoaId, idsPessoas));
      await db.delete(identificadores).where(inArray(identificadores.pessoaId, idsPessoas));
      await db.delete(pessoas).where(inArray(pessoas.id, idsPessoas));
    }
    if (idsEntradas.length) {
      await db.delete(entradasBrutas).where(inArray(entradasBrutas.id, idsEntradas));
    }
  });

  async function lerEntrada(id: string) {
    const [e] = await db.select().from(entradasBrutas).where(eq(entradasBrutas.id, id));
    return e;
  }

  it("reenviar o mesmo lote não duplica", async () => {
    const lote = [
      { fonte: "outra" as const, chaveIdempotencia: chave("lote-1"), payload: { n: 1 } },
      { fonte: "outra" as const, chaveIdempotencia: chave("lote-2"), payload: { n: 2 } },
      // Mesma chave em outra fonte é outra entrada.
      { fonte: "manual" as const, chaveIdempotencia: chave("lote-1"), payload: { n: 3 } },
    ];
    const primeira = await registrarEntradas(lote);
    expect(primeira.aceitas.map((a) => a.duplicada)).toEqual([false, false, false]);
    expect(new Set(primeira.aceitas.map((a) => a.id)).size).toBe(3);

    const segunda = await registrarEntradas(lote);
    expect(segunda.aceitas.map((a) => a.duplicada)).toEqual([true, true, true]);
    expect(segunda.aceitas.map((a) => a.id)).toEqual(primeira.aceitas.map((a) => a.id));

    const linhas = await db
      .select({ id: entradasBrutas.id, status: entradasBrutas.status })
      .from(entradasBrutas)
      .where(inArray(entradasBrutas.chaveIdempotencia, [chave("lote-1"), chave("lote-2")]));
    expect(linhas).toHaveLength(3);
    expect(linhas.every((l) => l.status === "pendente")).toBe(true);
  });

  it("chave repetida dentro do mesmo lote vira uma entrada só", async () => {
    const c = chave("repetida");
    const r = await registrarEntradas([
      { fonte: "outra", chaveIdempotencia: c, payload: { v: 1 } },
      { fonte: "outra", chaveIdempotencia: c, payload: { v: 2 } },
    ]);
    expect(r.aceitas.map((a) => a.duplicada)).toEqual([false, true]);
    expect(r.aceitas[0].id).toBe(r.aceitas[1].id);
  });

  it("processador que lança: status erro e tentativas 1; corrigido, processa", async () => {
    const {
      aceitas: [{ id }],
    } = await registrarEntradas([{ fonte: "outra", chaveIdempotencia: chave("falha"), payload: {} }]);

    registrarProcessador("outra", async () => {
      throw new Error("Falha simulada no processador");
    });
    const r1 = await processarEntrada(id);
    expect(r1).toMatchObject({ status: "erro", erro: "Falha simulada no processador" });
    let e = await lerEntrada(id);
    expect(e).toMatchObject({ status: "erro", tentativas: 1, erro: "Falha simulada no processador" });
    expect(e.processadoEm).toBeNull();

    // Mensagem de erro longa é cortada em 2000 caracteres.
    registrarProcessador("outra", async () => {
      throw new Error("x".repeat(5000));
    });
    await processarEntrada(id);
    e = await lerEntrada(id);
    expect(e.tentativas).toBe(2);
    expect(e.erro).toHaveLength(2000);

    let chamadas = 0;
    registrarProcessador("outra", async (tx, entrada) => {
      chamadas++;
      expect(entrada.id).toBe(id);
      expect(typeof tx.select).toBe("function");
    });
    expect((await processarEntrada(id)).status).toBe("processado");
    e = await lerEntrada(id);
    expect(e).toMatchObject({ status: "processado", erro: null, tentativas: 2 });
    expect(e.processadoEm).toBeInstanceOf(Date);

    // Já processada: sem efeito, o processador não roda de novo.
    expect((await processarEntrada(id)).status).toBe("sem_efeito");
    expect(chamadas).toBe(1);
  });

  it("falha desfaz o que o processador gravou na transação", async () => {
    const tel = celularAleatorio();
    telefones.push(tel.canonico);
    const {
      aceitas: [{ id }],
    } = await registrarEntradas([{ fonte: "outra", chaveIdempotencia: chave("desfaz"), payload: {} }]);
    registrarProcessador("outra", async (tx) => {
      const [p] = await tx.insert(pessoas).values({ nomeExibicao: "Some" }).returning();
      await tx.insert(identificadores).values({ pessoaId: p.id, tipo: "telefone", valor: tel.canonico });
      throw new Error("Falha depois de gravar");
    });
    expect((await processarEntrada(id)).status).toBe("erro");
    const ids = await db.select().from(identificadores).where(eq(identificadores.valor, tel.canonico));
    expect(ids).toHaveLength(0);
  });

  it("sem processador: status erro com mensagem", async () => {
    const {
      aceitas: [{ id }],
    } = await registrarEntradas([{ fonte: "outra", chaveIdempotencia: chave("sem"), payload: {} }]);
    const r = await processarEntrada(id);
    expect(r).toMatchObject({ status: "erro", erro: "Sem processador para a fonte outra" });
    expect(await lerEntrada(id)).toMatchObject({
      status: "erro",
      tentativas: 1,
      erro: "Sem processador para a fonte outra",
    });
  });

  it("entrada inexistente", async () => {
    expect((await processarEntrada(randomUUID())).status).toBe("nao_encontrada");
  });

  it("processarPendentes pega pendentes e com erro abaixo do limite de tentativas", async () => {
    const { aceitas } = await registrarEntradas([
      { fonte: "outra", chaveIdempotencia: chave("pend-1"), payload: {} },
      { fonte: "outra", chaveIdempotencia: chave("pend-2"), payload: {} },
    ]);
    const [pend1, pend2] = aceitas.map((a) => a.id);
    // pend-2 já esgotou as tentativas: fica de fora.
    await db
      .update(entradasBrutas)
      .set({ status: "erro", tentativas: 10 })
      .where(eq(entradasBrutas.id, pend2));

    const vistos: string[] = [];
    registrarProcessador("outra", async (_tx, entrada) => {
      vistos.push(entrada.id);
    });
    await processarPendentes({ limite: 1000 });
    expect(vistos).toContain(pend1);
    expect(vistos).not.toContain(pend2);
    expect((await lerEntrada(pend1)).status).toBe("processado");
    expect((await lerEntrada(pend2)).status).toBe("erro");
  });

  it("processador manual: mesmo telefone com e sem o nono dígito, 1 pessoa e 2 notas", async () => {
    const tel = celularAleatorio();
    telefones.push(tel.canonico);
    const lote = [
      {
        fonte: "manual" as const,
        chaveIdempotencia: chave("manual-1"),
        payload: { nome: "Ana", telefone: tel.semNono, nota: "Primeiro contato" },
      },
      {
        fonte: "manual" as const,
        chaveIdempotencia: chave("manual-2"),
        payload: { nome: "Ana Paula", telefone: `+${tel.canonico}`, nota: "Retornou" },
      },
    ];
    const { aceitas } = await registrarEntradas(lote);
    for (const a of aceitas) expect((await processarEntrada(a.id)).status).toBe("processado");

    const donos = await db
      .select()
      .from(identificadores)
      .where(eq(identificadores.valor, tel.canonico));
    expect(donos).toHaveLength(1);
    const pessoaId = donos[0].pessoaId;
    const [p] = await db.select().from(pessoas).where(eq(pessoas.id, pessoaId));
    expect(p.nomeExibicao).toBe("Ana");

    const notas = await db.select().from(eventos).where(eq(eventos.pessoaId, pessoaId));
    expect(notas).toHaveLength(2);
    expect(notas.every((n) => n.tipo === "nota" && n.canal === "manual")).toBe(true);
    expect(notas.map((n) => (n.dados as { texto: string }).texto).sort()).toEqual([
      "Primeiro contato",
      "Retornou",
    ]);

    // Reprocessar à força (como se o status tivesse voltado a erro) não duplica o evento.
    await db
      .update(entradasBrutas)
      .set({ status: "erro" })
      .where(eq(entradasBrutas.id, aceitas[0].id));
    expect((await processarEntrada(aceitas[0].id)).status).toBe("processado");
    expect(await db.select().from(eventos).where(eq(eventos.pessoaId, pessoaId))).toHaveLength(2);

    // Payload sem identificador válido vira erro.
    const {
      aceitas: [ruim],
    } = await registrarEntradas([
      { fonte: "manual", chaveIdempotencia: chave("manual-ruim"), payload: { nome: "Sem contato" } },
    ]);
    expect(await processarEntrada(ruim.id)).toMatchObject({
      status: "erro",
      erro: "Entrada manual sem telefone ou e-mail válido",
    });
  });
});
