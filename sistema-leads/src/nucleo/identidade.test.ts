import { and, eq, inArray, or } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { celularAleatorio, emailAleatorio, emTransacaoDesfeita, temBanco } from "./teste/banco";
import type { Tx } from "@/db";
import { filaRevisao, identificadores, pessoas } from "@/db/schema";
import { montarIdentificadores, resolverPessoa } from "./identidade";

describe("montarIdentificadores", () => {
  it("normaliza, ordena por força e descarta inválidos", () => {
    const ids = montarIdentificadores({
      email: " Maria@Gmail.com ",
      telefone: "(62) 9999-9999",
      metaLeadId: "1234567890",
    });
    expect(ids).toEqual([
      { tipo: "telefone", valor: "5562999999999", valorOriginal: "(62) 9999-9999" },
      { tipo: "email", valor: "maria@gmail.com", valorOriginal: " Maria@Gmail.com " },
      { tipo: "meta_lead_id", valor: "1234567890", valorOriginal: "1234567890" },
    ]);
    expect(montarIdentificadores({ telefone: "abc", email: "nao-e-email" })).toEqual([]);
  });

  it("deriva o telefone do wa_id @c.us e não duplica", () => {
    const ids = montarIdentificadores({ waId: "556299999999@c.us", telefone: "5562999999999" });
    expect(ids.map((i) => [i.tipo, i.valor])).toEqual([
      ["telefone", "5562999999999"],
      ["wa_id", "556299999999@c.us"],
    ]);
    const lid = montarIdentificadores({ waId: "123456789012345@lid" });
    expect(lid.map((i) => i.tipo)).toEqual(["wa_id"]);
  });
});

async function identificadoresDe(tx: Tx, pessoaId: string) {
  return tx
    .select({ tipo: identificadores.tipo, valor: identificadores.valor })
    .from(identificadores)
    .where(eq(identificadores.pessoaId, pessoaId));
}

async function itensRevisao(tx: Tx, a: string, b: string) {
  return tx
    .select()
    .from(filaRevisao)
    .where(
      or(
        and(eq(filaRevisao.pessoaAId, a), eq(filaRevisao.pessoaBId, b)),
        and(eq(filaRevisao.pessoaAId, b), eq(filaRevisao.pessoaBId, a)),
      ),
    );
}

describe.skipIf(!temBanco)("resolverPessoa (integração)", () => {
  it("cria pessoa nova com todos os identificadores", async () => {
    await emTransacaoDesfeita(async (tx) => {
      const tel = celularAleatorio();
      const email = emailAleatorio();
      const r = await resolverPessoa(tx, montarIdentificadores({ telefone: tel.canonico, email }), {
        nomeExibicao: "Maria",
      });
      expect(r).toMatchObject({ criada: true, conflito: false });

      const [p] = await tx.select().from(pessoas).where(eq(pessoas.id, r.pessoaId));
      expect(p.nomeExibicao).toBe("Maria");
      expect(p.primeiroContatoEm).toBeInstanceOf(Date);
      const ids = await identificadoresDe(tx, r.pessoaId);
      expect(ids).toHaveLength(2);
      expect(ids).toEqual(
        expect.arrayContaining([
          { tipo: "telefone", valor: tel.canonico },
          { tipo: "email", valor: email },
        ]),
      );
    });
  });

  it("vincula à pessoa existente, adiciona o e-mail novo e preenche o nome vazio", async () => {
    await emTransacaoDesfeita(async (tx) => {
      const tel = celularAleatorio();
      const primeira = await resolverPessoa(tx, montarIdentificadores({ telefone: tel.canonico }));
      const email = emailAleatorio();
      const segunda = await resolverPessoa(tx, montarIdentificadores({ telefone: tel.canonico, email }), {
        nomeExibicao: "João",
      });
      expect(segunda).toEqual({ pessoaId: primeira.pessoaId, criada: false, conflito: false });
      const ids = await identificadoresDe(tx, primeira.pessoaId);
      expect(ids.map((i) => i.tipo).sort()).toEqual(["email", "telefone"]);
      const [p] = await tx.select().from(pessoas).where(eq(pessoas.id, primeira.pessoaId));
      expect(p.nomeExibicao).toBe("João");

      // Nome já preenchido não é sobrescrito.
      await resolverPessoa(tx, montarIdentificadores({ email }), { nomeExibicao: "Outro" });
      const [depois] = await tx.select().from(pessoas).where(eq(pessoas.id, primeira.pessoaId));
      expect(depois.nomeExibicao).toBe("João");
    });
  });

  it("o mesmo telefone com e sem o nono dígito cai na MESMA pessoa", async () => {
    await emTransacaoDesfeita(async (tx) => {
      const tel = celularAleatorio();
      const antigo = await resolverPessoa(tx, montarIdentificadores({ telefone: tel.semNono }));
      const novo = await resolverPessoa(tx, montarIdentificadores({ telefone: tel.canonico }));
      const viaWaId = await resolverPessoa(
        tx,
        montarIdentificadores({ waId: `${tel.semNono}@c.us` }),
      );
      expect(antigo.criada).toBe(true);
      expect(novo).toEqual({ pessoaId: antigo.pessoaId, criada: false, conflito: false });
      expect(viaWaId.pessoaId).toBe(antigo.pessoaId);

      const telefones = (await identificadoresDe(tx, antigo.pessoaId)).filter(
        (i) => i.tipo === "telefone",
      );
      expect(telefones).toEqual([{ tipo: "telefone", valor: tel.canonico }]);
    });
  });

  it("conflito: telefone de A + e-mail de B vincula a A, abre 1 item na fila e não repete", async () => {
    await emTransacaoDesfeita(async (tx) => {
      const telA = celularAleatorio();
      const emailB = emailAleatorio();
      const a = await resolverPessoa(tx, montarIdentificadores({ telefone: telA.canonico }));
      const b = await resolverPessoa(tx, montarIdentificadores({ email: emailB }));
      expect(a.pessoaId).not.toBe(b.pessoaId);

      const entrada = montarIdentificadores({ email: emailB, telefone: telA.semNono });
      const r = await resolverPessoa(tx, entrada);
      expect(r).toEqual({ pessoaId: a.pessoaId, criada: false, conflito: true });

      const itens = await itensRevisao(tx, a.pessoaId, b.pessoaId);
      expect(itens).toHaveLength(1);
      expect(itens[0]).toMatchObject({
        tipo: "conflito_identidade",
        status: "aberta",
        pessoaAId: a.pessoaId,
        pessoaBId: b.pessoaId,
      });
      expect(itens[0].motivo).toContain(telA.canonico);
      expect(itens[0].motivo).toContain(emailB);

      // Nada é mesclado: o e-mail continua de B.
      const [donoEmail] = await tx
        .select({ pessoaId: identificadores.pessoaId })
        .from(identificadores)
        .where(and(eq(identificadores.tipo, "email"), eq(identificadores.valor, emailB)));
      expect(donoEmail.pessoaId).toBe(b.pessoaId);

      // Repetir a mesma entrada não abre um segundo item.
      const repetida = await resolverPessoa(tx, entrada);
      expect(repetida.conflito).toBe(true);
      expect(await itensRevisao(tx, a.pessoaId, b.pessoaId)).toHaveLength(1);
    });
  });

  it("conflito: identificador novo vai para a pessoa escolhida", async () => {
    await emTransacaoDesfeita(async (tx) => {
      const telA = celularAleatorio();
      const emailB = emailAleatorio();
      const waNovo = `${celularAleatorio().semNono}@c.us`;
      const a = await resolverPessoa(tx, montarIdentificadores({ telefone: telA.canonico }));
      await resolverPessoa(tx, montarIdentificadores({ email: emailB }));
      const r = await resolverPessoa(tx, montarIdentificadores({ email: emailB, waId: waNovo }));
      // O wa_id é novo e traz um telefone novo: a pessoa escolhida é a do e-mail (B), não A.
      expect(r.conflito).toBe(false);
      expect(r.pessoaId).not.toBe(a.pessoaId);
      const ids = await identificadoresDe(tx, r.pessoaId);
      expect(ids.map((i) => i.tipo).sort()).toEqual(["email", "telefone", "wa_id"]);
    });
  });

  it("pessoa mesclada redireciona para a sobrevivente", async () => {
    await emTransacaoDesfeita(async (tx) => {
      const telA = celularAleatorio();
      const telB = celularAleatorio();
      const a = await resolverPessoa(tx, montarIdentificadores({ telefone: telA.canonico }));
      const b = await resolverPessoa(tx, montarIdentificadores({ telefone: telB.canonico }));
      await tx
        .update(pessoas)
        .set({ mescladaParaId: a.pessoaId, mescladaEm: new Date() })
        .where(eq(pessoas.id, b.pessoaId));

      const r = await resolverPessoa(tx, montarIdentificadores({ telefone: telB.semNono }));
      expect(r).toEqual({ pessoaId: a.pessoaId, criada: false, conflito: false });

      // Telefone de A + telefone de B (mesclada em A): é a mesma pessoa, sem conflito.
      const ambos = await resolverPessoa(tx, [
        ...montarIdentificadores({ telefone: telA.canonico }),
        ...montarIdentificadores({ telefone: telB.canonico }),
      ]);
      expect(ambos).toEqual({ pessoaId: a.pessoaId, criada: false, conflito: false });
      const fila = await tx
        .select()
        .from(filaRevisao)
        .where(inArray(filaRevisao.pessoaAId, [a.pessoaId, b.pessoaId]));
      expect(fila).toHaveLength(0);
    });
  });

  it("lança sem identificadores", async () => {
    await emTransacaoDesfeita(async (tx) => {
      await expect(resolverPessoa(tx, [])).rejects.toThrow(/Nenhum identificador/);
    });
  });
});
