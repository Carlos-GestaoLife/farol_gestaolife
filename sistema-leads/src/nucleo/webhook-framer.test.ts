import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { celularAleatorio, emailAleatorio, temBanco } from "./teste/banco";
import { db } from "@/db";
import { entradasBrutas, estagios, eventos, identificadores, pessoas } from "@/db/schema";
import { POST } from "@/app/api/webhooks/framer/route";
import { chaveSha256 } from "./entradas";
import { autenticarFramer, receberWebhookFramer } from "./webhook-framer";

const SEGREDO = "segredo-framer-de-teste";
const original = process.env.FRAMER_WEBHOOK_SECRET;

beforeEach(() => {
  process.env.FRAMER_WEBHOOK_SECRET = SEGREDO;
});
afterEach(() => {
  if (original === undefined) delete process.env.FRAMER_WEBHOOK_SECRET;
  else process.env.FRAMER_WEBHOOK_SECRET = original;
});

describe("autenticação do webhook do Framer (k)", () => {
  it("k certo ok; k errado, ausente ou com outro tamanho: inválido", () => {
    expect(autenticarFramer(SEGREDO)).toBe("ok");
    expect(autenticarFramer("errado")).toBe("invalido");
    expect(autenticarFramer(SEGREDO + "x")).toBe("invalido");
    expect(autenticarFramer(null)).toBe("invalido");
    expect(autenticarFramer("")).toBe("invalido");
  });

  it("sem FRAMER_WEBHOOK_SECRET: 503 com mensagem clara", async () => {
    delete process.env.FRAMER_WEBHOOK_SECRET;
    expect(autenticarFramer(SEGREDO)).toBe("sem_segredo");
    const r = await POST(
      new Request(`http://localhost/api/webhooks/framer?k=${SEGREDO}`, { method: "POST", body: "{}" }),
    );
    expect(r.status).toBe(503);
    expect((await r.json()).erro).toContain("FRAMER_WEBHOOK_SECRET");
  });

  it("rota: k errado ou ausente dá 401 sem tocar no banco", async () => {
    for (const q of ["?k=errado", ""]) {
      const r = await POST(
        new Request(`http://localhost/api/webhooks/framer${q}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"Nome":"x"}',
        }),
      );
      expect(r.status).toBe(401);
    }
  });
});

describe.skipIf(!temBanco)("webhook do Framer (integração)", () => {
  const chaves: string[] = [];
  const pessoasCriadas: string[] = [];

  afterAll(async () => {
    if (pessoasCriadas.length) {
      await db.delete(eventos).where(inArray(eventos.pessoaId, pessoasCriadas));
      await db.delete(identificadores).where(inArray(identificadores.pessoaId, pessoasCriadas));
      await db.delete(pessoas).where(inArray(pessoas.id, pessoasCriadas));
    }
    if (chaves.length) {
      await db
        .delete(entradasBrutas)
        .where(and(eq(entradasBrutas.fonte, "framer"), inArray(entradasBrutas.chaveIdempotencia, chaves)));
    }
  });

  async function entrada(chave: string) {
    const [e] = await db
      .select()
      .from(entradasBrutas)
      .where(and(eq(entradasBrutas.fonte, "framer"), eq(entradasBrutas.chaveIdempotencia, chave)));
    return e;
  }

  it("um envio cria pessoa e evento form_enviado; reenvio idêntico é duplicado", async () => {
    const tel = celularAleatorio();
    const email = emailAleatorio();
    const corpo = {
      "Nome completo": "Maria Teste",
      WhatsApp: tel.semNono.slice(2), // sem DDI e sem o nono dígito: normaliza para o canônico
      "E-mail": email.toUpperCase(),
      Cidade: "Maceió",
      utm_source: "instagram",
      utm_campaign: "gnv",
      origem: "LP-TESTE",
      fbclid: "fb-1",
      Pergunta: "resposta livre",
    };
    const texto = JSON.stringify(corpo);
    chaves.push(chaveSha256(corpo));

    const req = () =>
      new Request(`http://localhost/api/webhooks/framer?k=${SEGREDO}`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Framer-Teste" },
        body: texto,
      });

    const r1 = await POST(req());
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ ok: true, duplicado: false });

    const e = await entrada(chaveSha256(corpo));
    expect(e.status).toBe("processado");
    expect(e.payload).toMatchObject({
      interpretado: true,
      corpo,
      cabecalhos: { "content-type": "application/json", "user-agent": "Framer-Teste" },
    });

    const ids = await db
      .select()
      .from(identificadores)
      .where(and(eq(identificadores.tipo, "telefone"), eq(identificadores.valor, tel.canonico)));
    expect(ids).toHaveLength(1);
    const pessoaId = ids[0].pessoaId;
    pessoasCriadas.push(pessoaId);

    const todos = await db.select().from(identificadores).where(eq(identificadores.pessoaId, pessoaId));
    expect(todos.map((i) => `${i.tipo}:${i.valor}`).sort()).toEqual(
      [`email:${email}`, `telefone:${tel.canonico}`].sort(),
    );
    const [p] = await db
      .select({ nome: pessoas.nomeExibicao, estagio: estagios.nome, primeiro: pessoas.primeiroContatoEm })
      .from(pessoas)
      .leftJoin(estagios, eq(pessoas.estagioId, estagios.id))
      .where(eq(pessoas.id, pessoaId));
    expect(p).toMatchObject({ nome: "Maria Teste", estagio: "Novo lead" });

    const evs = await db.select().from(eventos).where(eq(eventos.pessoaId, pessoaId));
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      tipo: "form_enviado",
      canal: "lp_form",
      origemId: null,
      entradaBrutaId: e.id,
    });
    expect(evs[0].ocorridoEm.getTime()).toBe(e.recebidoEm.getTime());
    expect(evs[0].dados).toMatchObject({
      nome: "Maria Teste",
      cidade: "Maceió",
      utm_source: "instagram",
      utm_campaign: "gnv",
      utm_medium: null,
      origem: "LP-TESTE",
      fbclid: "fb-1",
      outros: { Pergunta: "resposta livre" },
    });

    // Reenvio idêntico (com as chaves em outra ordem): duplicado e nada novo.
    const r2 = await receberWebhookFramer({
      k: SEGREDO,
      texto: JSON.stringify(Object.fromEntries(Object.entries(corpo).reverse())),
      contentType: "application/json",
      userAgent: null,
    });
    expect(r2).toEqual({ status: 200, corpo: { ok: true, duplicado: true } });
    expect(await db.select().from(eventos).where(eq(eventos.pessoaId, pessoaId))).toHaveLength(1);
    const linhas = await db
      .select({ id: entradasBrutas.id })
      .from(entradasBrutas)
      .where(and(eq(entradasBrutas.fonte, "framer"), eq(entradasBrutas.chaveIdempotencia, chaveSha256(corpo))));
    expect(linhas).toHaveLength(1);
  });

  it("formulário urlencoded também cria o lead", async () => {
    const tel = celularAleatorio();
    const texto = `nome=Jo%C3%A3o&telefone=%2B${tel.canonico}&utm_source=google`;
    const r = await receberWebhookFramer({
      k: SEGREDO,
      texto,
      contentType: "application/x-www-form-urlencoded",
      userAgent: null,
    });
    expect(r).toEqual({ status: 200, corpo: { ok: true, duplicado: false } });
    const corpo = { nome: "João", telefone: `+${tel.canonico}`, utm_source: "google" };
    chaves.push(chaveSha256(corpo));
    expect((await entrada(chaveSha256(corpo))).status).toBe("processado");
    const [id] = await db
      .select()
      .from(identificadores)
      .where(and(eq(identificadores.tipo, "telefone"), eq(identificadores.valor, tel.canonico)));
    pessoasCriadas.push(id.pessoaId);
  });

  it("sem telefone nem e-mail: entrada gravada em erro com mensagem", async () => {
    const corpo = { Nome: `Sem contato ${crypto.randomUUID()}`, Mensagem: "oi" };
    chaves.push(chaveSha256(corpo));
    const r = await receberWebhookFramer({
      k: SEGREDO,
      texto: JSON.stringify(corpo),
      contentType: "application/json",
      userAgent: null,
    });
    expect(r).toEqual({ status: 200, corpo: { ok: true, duplicado: false } });
    const e = await entrada(chaveSha256(corpo));
    expect(e).toMatchObject({ status: "erro", tentativas: 1 });
    expect(e.erro).toContain("sem telefone nem e-mail");
    expect(e.erro).toContain("Mensagem");
  });

  it("corpo ilegível: gravado cru e marcado como erro (nada se perde)", async () => {
    const texto = `não é json ${crypto.randomUUID()}`;
    chaves.push(chaveSha256({ bruto: texto }));
    const r = await receberWebhookFramer({ k: SEGREDO, texto, contentType: "text/plain", userAgent: null });
    expect(r.status).toBe(200);
    const e = await entrada(chaveSha256({ bruto: texto }));
    expect(e.payload).toMatchObject({ interpretado: false, corpo: { bruto: texto } });
    expect(e.status).toBe("erro");
    expect(e.erro).toContain("não interpretado");
  });
});
