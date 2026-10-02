import { createHmac } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { celularAleatorio, emailAleatorio, temBanco } from "./teste/banco";
import { db } from "@/db";
import { entradasBrutas, estagios, eventos, identificadores, origens, pessoas } from "@/db/schema";
import { GET, POST } from "@/app/api/webhooks/meta/route";
import { processarEntrada, registrarProcessador } from "./entradas";
import type { FetchFn } from "./meta";
import { criarProcessadorMetaLead, processarMetaLead } from "./processadores/meta-lead";
import { receberWebhookMeta, verificarWebhookMeta } from "./webhook-meta";

const APP_SECRET = "app-secret-de-teste";
const VERIFY = "verify-token-de-teste";
const TOKEN = "page-token-de-teste";
const NOMES = ["META_APP_SECRET", "META_VERIFY_TOKEN", "META_PAGE_ACCESS_TOKEN"] as const;
const originais = Object.fromEntries(NOMES.map((n) => [n, process.env[n]]));

beforeEach(() => {
  process.env.META_APP_SECRET = APP_SECRET;
  process.env.META_VERIFY_TOKEN = VERIFY;
  process.env.META_PAGE_ACCESS_TOKEN = TOKEN;
});
afterEach(() => {
  for (const n of NOMES) {
    if (originais[n] === undefined) delete process.env[n];
    else process.env[n] = originais[n];
  }
  registrarProcessador("meta_lead", processarMetaLead);
});

const assinar = (corpo: string, segredo = APP_SECRET) =>
  "sha256=" + createHmac("sha256", segredo).update(corpo, "utf8").digest("hex");

function notificacao(leads: { leadgen_id: string; form_id?: string; ad_id?: string }[]): string {
  return JSON.stringify({
    object: "page",
    entry: [
      {
        id: "111222333",
        time: 1790000000,
        changes: leads.map((l) => ({
          field: "leadgen",
          value: { page_id: "111222333", created_time: 1790000000, ...l },
        })),
      },
    ],
  });
}

describe("GET /api/webhooks/meta (verificação)", () => {
  const url = (token: string, modo = "subscribe") =>
    `http://localhost/api/webhooks/meta?hub.mode=${modo}&hub.verify_token=${token}&hub.challenge=desafio123`;

  it("token certo devolve o challenge em texto puro; errado 403", async () => {
    const ok = await GET(new Request(url(VERIFY)));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("desafio123");
    expect(ok.headers.get("content-type")).toContain("text/plain");
    expect((await GET(new Request(url("errado")))).status).toBe(403);
    expect((await GET(new Request(url(VERIFY, "unsubscribe")))).status).toBe(403);
  });

  it("sem META_VERIFY_TOKEN: 503", () => {
    delete process.env.META_VERIFY_TOKEN;
    expect(verificarWebhookMeta(new URLSearchParams(url(VERIFY).split("?")[1])).status).toBe(503);
  });
});

describe("POST /api/webhooks/meta: assinatura", () => {
  it("assinatura errada ou ausente: 401 e nada gravado", async () => {
    const corpo = notificacao([{ leadgen_id: "1" }]);
    for (const assinatura of [assinar(corpo, "outro"), null]) {
      const r = await receberWebhookMeta({ texto: corpo, assinatura });
      expect(r).toEqual({ status: 401, corpo: { erro: "Assinatura inválida" }, idsParaProcessar: [] });
    }
    const rota = await POST(
      new Request("http://localhost/api/webhooks/meta", {
        method: "POST",
        headers: { "x-hub-signature-256": assinar(corpo, "outro") },
        body: corpo,
      }),
    );
    expect(rota.status).toBe(401);
  });

  it("sem META_APP_SECRET: 503", async () => {
    delete process.env.META_APP_SECRET;
    const corpo = notificacao([]);
    expect((await receberWebhookMeta({ texto: corpo, assinatura: assinar(corpo) })).status).toBe(503);
  });
});

describe.skipIf(!temBanco)("webhook da Meta (integração)", () => {
  const leadgens: string[] = [];
  const pessoasCriadas: string[] = [];
  const novoLeadgen = () => {
    const id = String(Date.now()) + String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
    leadgens.push(id);
    return id;
  };

  afterAll(async () => {
    const ids = await db
      .select({ pessoaId: identificadores.pessoaId })
      .from(identificadores)
      .where(and(eq(identificadores.tipo, "meta_lead_id"), inArray(identificadores.valor, leadgens)));
    pessoasCriadas.push(...ids.map((i) => i.pessoaId));
    if (pessoasCriadas.length) {
      await db.delete(eventos).where(inArray(eventos.pessoaId, pessoasCriadas));
      await db.delete(identificadores).where(inArray(identificadores.pessoaId, pessoasCriadas));
      await db.delete(pessoas).where(inArray(pessoas.id, pessoasCriadas));
    }
    if (leadgens.length) {
      await db
        .delete(entradasBrutas)
        .where(and(eq(entradasBrutas.fonte, "meta_lead"), inArray(entradasBrutas.chaveIdempotencia, leadgens)));
    }
    // Origem automática criada pelo formulário não cadastrado dos testes.
    await db.delete(origens).where(eq(origens.codigo, "formulario-nao-cadastrado-5001"));
  });

  async function entrada(leadgenId: string) {
    const [e] = await db
      .select()
      .from(entradasBrutas)
      .where(and(eq(entradasBrutas.fonte, "meta_lead"), eq(entradasBrutas.chaveIdempotencia, leadgenId)));
    return e;
  }

  function graphFalsa(dados: { tel: string; email: string }, chamadas: string[] = []): FetchFn {
    return async (url, init) => {
      chamadas.push(url);
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
      const id = new URL(url).pathname.split("/").pop();
      return Response.json({
        id,
        created_time: "2026-09-30T12:00:00+0000",
        ad_id: "2001",
        adset_id: "3001",
        campaign_id: "4001",
        form_id: "5001",
        field_data: [
          { name: "full_name", values: ["Lead Meta Teste"] },
          { name: "phone_number", values: [dados.tel] },
          { name: "email", values: [dados.email] },
          { name: "city", values: ["Maceió"] },
          { name: "qual_o_seu_cargo?", values: ["Dono"] },
        ],
      });
    };
  }

  it("webhook + processamento cria pessoa com 3 identificadores e evento form_enviado", async () => {
    const tel = celularAleatorio();
    const email = emailAleatorio();
    const leadgen = novoLeadgen();
    const chamadas: string[] = [];
    registrarProcessador("meta_lead", criarProcessadorMetaLead(graphFalsa({ tel: `+${tel.canonico}`, email }, chamadas)));

    const corpo = notificacao([{ leadgen_id: leadgen, form_id: "5001", ad_id: "2001" }]);
    // Pela rota: fora de um request do Next o after() cai no fallback síncrono.
    const r = await POST(
      new Request("http://localhost/api/webhooks/meta", {
        method: "POST",
        headers: { "x-hub-signature-256": assinar(corpo), "content-type": "application/json" },
        body: corpo,
      }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, recebidos: 1, duplicados: 0 });
    expect(chamadas).toHaveLength(1);

    const e = await entrada(leadgen);
    expect(e.status).toBe("processado");
    expect(e.payload).toMatchObject({
      leadgen_id: leadgen,
      form_id: "5001",
      ad_id: "2001",
      page_id: "111222333",
      entry_id: "111222333",
      created_time: 1790000000,
    });

    const [dono] = await db
      .select()
      .from(identificadores)
      .where(and(eq(identificadores.tipo, "meta_lead_id"), eq(identificadores.valor, leadgen)));
    const ids = await db.select().from(identificadores).where(eq(identificadores.pessoaId, dono.pessoaId));
    expect(ids.map((i) => `${i.tipo}:${i.valor}`).sort()).toEqual(
      [`email:${email}`, `meta_lead_id:${leadgen}`, `telefone:${tel.canonico}`].sort(),
    );
    const [p] = await db
      .select({ nome: pessoas.nomeExibicao, estagio: estagios.nome, primeiro: pessoas.primeiroContatoEm })
      .from(pessoas)
      .leftJoin(estagios, eq(pessoas.estagioId, estagios.id))
      .where(eq(pessoas.id, dono.pessoaId));
    expect(p).toMatchObject({ nome: "Lead Meta Teste", estagio: "Novo lead" });
    expect(p.primeiro?.toISOString()).toBe("2026-09-30T12:00:00.000Z");

    const evs = await db.select().from(eventos).where(eq(eventos.pessoaId, dono.pessoaId));
    expect(evs).toHaveLength(1);
    // Formulário 5001 não cadastrado: origem automática "Formulário não cadastrado 5001".
    const [auto] = await db.select().from(origens).where(eq(origens.codigo, "formulario-nao-cadastrado-5001"));
    expect(auto).toMatchObject({
      nome: "Formulário não cadastrado 5001",
      tipo: "form_meta",
      metaFormId: "5001",
      criadaAutomaticamente: true,
    });
    expect(evs[0]).toMatchObject({ tipo: "form_enviado", canal: "meta_form", origemId: auto.id, entradaBrutaId: e.id });
    expect(evs[0].ocorridoEm.toISOString()).toBe("2026-09-30T12:00:00.000Z");
    expect(evs[0].dados).toMatchObject({
      leadgen_id: leadgen,
      form_id: "5001",
      ad_id: "2001",
      adset_id: "3001",
      campaign_id: "4001",
      campos: { nome: "Lead Meta Teste", cidade: "Maceió", email },
      outros: { "qual_o_seu_cargo?": "Dono" },
    });

    // Reenvio do mesmo leadgen_id: duplicado, sem nova chamada nem linhas novas.
    const r2 = await receberWebhookMeta({ texto: corpo, assinatura: assinar(corpo) });
    expect(r2.status).toBe(200);
    expect(r2.corpo).toEqual({ ok: true, recebidos: 1, duplicados: 1 });
    await processarEntrada(e.id);
    expect(chamadas).toHaveLength(1);
    expect(await db.select().from(eventos).where(eq(eventos.pessoaId, dono.pessoaId))).toHaveLength(1);
  });

  it("Graph API com 400: entrada em erro (tentativas 1); com fetch corrigido, reprocessa", async () => {
    const tel = celularAleatorio();
    const email = emailAleatorio();
    const leadgen = novoLeadgen();
    registrarProcessador(
      "meta_lead",
      criarProcessadorMetaLead(async () =>
        Response.json(
          { error: { message: "Unsupported get request", type: "GraphMethodException", code: 100 } },
          { status: 400 },
        ),
      ),
    );

    const corpo = notificacao([{ leadgen_id: leadgen }]);
    const r = await receberWebhookMeta({ texto: corpo, assinatura: assinar(corpo) });
    expect(r.status).toBe(200);
    expect(r.idsParaProcessar).toHaveLength(1);
    const res = await processarEntrada(r.idsParaProcessar[0]);
    expect(res.status).toBe("erro");

    let e = await entrada(leadgen);
    expect(e).toMatchObject({ status: "erro", tentativas: 1 });
    expect(e.erro).toContain("HTTP 400");
    expect(e.erro).toContain("Unsupported get request");
    expect(e.erro).not.toContain(TOKEN);

    registrarProcessador("meta_lead", criarProcessadorMetaLead(graphFalsa({ tel: tel.semNono, email })));
    expect((await processarEntrada(e.id)).status).toBe("processado");
    e = await entrada(leadgen);
    expect(e).toMatchObject({ status: "processado", tentativas: 1, erro: null });
    const [dono] = await db
      .select()
      .from(identificadores)
      .where(and(eq(identificadores.tipo, "telefone"), eq(identificadores.valor, tel.canonico)));
    expect(dono).toBeDefined();
  });

  it("assinatura válida com corpo ilegível: gravado cru e marcado como erro", async () => {
    const corpo = `{"entry": "quebrado" ${Date.now()}`;
    const r = await receberWebhookMeta({ texto: corpo, assinatura: assinar(corpo) });
    expect(r.status).toBe(200);
    expect(r.idsParaProcessar).toHaveLength(1);
    await processarEntrada(r.idsParaProcessar[0]);
    const [e] = await db.select().from(entradasBrutas).where(eq(entradasBrutas.id, r.idsParaProcessar[0]));
    expect(e.payload).toMatchObject({ bruto: corpo });
    expect(e.status).toBe("erro");
    expect(e.erro).toContain("sem leadgen_id");
    await db.delete(entradasBrutas).where(eq(entradasBrutas.id, e.id));
  });
});
