import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { entradasBrutas } from "@/db/schema";
import { autenticarCron } from "./reprocessamento";
import { temBanco } from "./teste/banco";

const SEGREDO = "segredo-do-cron-de-teste";
let anterior: string | undefined;

beforeEach(() => {
  anterior = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SEGREDO;
});

afterEach(() => {
  if (anterior === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = anterior;
});

describe("autenticarCron", () => {
  it("aceita só Bearer com o CRON_SECRET", () => {
    expect(autenticarCron(`Bearer ${SEGREDO}`)).toBe("ok");
    expect(autenticarCron(`bearer ${SEGREDO}`)).toBe("ok");
    expect(autenticarCron(`Bearer ${SEGREDO}x`)).toBe("invalido");
    expect(autenticarCron(SEGREDO)).toBe("invalido");
    expect(autenticarCron("Bearer ")).toBe("invalido");
    expect(autenticarCron(null)).toBe("invalido");
  });

  it("sem CRON_SECRET configurado: sem_segredo (a rota responde 503)", () => {
    delete process.env.CRON_SECRET;
    expect(autenticarCron(`Bearer ${SEGREDO}`)).toBe("sem_segredo");
    process.env.CRON_SECRET = "   ";
    expect(autenticarCron("Bearer   ")).toBe("sem_segredo");
  });
});

describe.skipIf(!temBanco)("rota /api/cron/reprocessar (integração)", () => {
  const chaves: string[] = [];

  afterAll(async () => {
    if (chaves.length) {
      await db
        .delete(entradasBrutas)
        .where(and(eq(entradasBrutas.fonte, "manual"), inArray(entradasBrutas.chaveIdempotencia, chaves)));
    }
  });

  async function entradaComErro(tentativas: number) {
    const chave = `teste-cron-${randomUUID()}`;
    chaves.push(chave);
    // Payload manual sem telefone nem e-mail: o processador sempre falha. Recebida em 2000 para
    // ficar entre as mais antigas (o reprocessamento vai das mais antigas para as mais novas).
    const [e] = await db
      .insert(entradasBrutas)
      .values({
        fonte: "manual",
        chaveIdempotencia: chave,
        payload: { nome: "Sem contato" },
        status: "erro",
        tentativas,
        erro: "falha anterior",
        recebidoEm: new Date("2000-01-01T00:00:00Z"),
      })
      .returning({ id: entradasBrutas.id });
    return e.id;
  }

  async function chamar(metodo: "GET" | "POST", authorization?: string) {
    const { GET, POST } = await import("@/app/api/cron/reprocessar/route");
    const req = new Request("http://localhost/api/cron/reprocessar", {
      method: metodo,
      headers: authorization ? { authorization } : {},
    });
    return metodo === "GET" ? GET(req) : POST(req);
  }

  it("401 sem header ou com segredo errado; 503 sem CRON_SECRET", async () => {
    expect((await chamar("POST")).status).toBe(401);
    expect((await chamar("GET", "Bearer errado")).status).toBe(401);
    delete process.env.CRON_SECRET;
    const r = await chamar("POST", `Bearer ${SEGREDO}`);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ erro: "Reprocessamento não configurado: defina CRON_SECRET" });
  });

  it("reprocessa entradas em erro (tentativas + 1) e pula as que já têm 10 tentativas", async () => {
    const comErro = await entradaComErro(1);
    const esgotada = await entradaComErro(10);

    const r = await chamar("POST", `Bearer ${SEGREDO}`);
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo).toMatchObject({ ok: true });
    expect(corpo.total).toBeGreaterThanOrEqual(1);
    expect(corpo.erros).toBeGreaterThanOrEqual(1);

    const [depois] = await db.select().from(entradasBrutas).where(eq(entradasBrutas.id, comErro));
    expect(depois).toMatchObject({ status: "erro", tentativas: 2 });
    expect(depois.erro).toContain("sem telefone ou e-mail");
    const [intocada] = await db.select().from(entradasBrutas).where(eq(entradasBrutas.id, esgotada));
    expect(intocada).toMatchObject({ status: "erro", tentativas: 10, erro: "falha anterior" });

    // GET (Vercel Cron) faz o mesmo.
    expect((await chamar("GET", `Bearer ${SEGREDO}`)).status).toBe(200);
    const [terceira] = await db.select().from(entradasBrutas).where(eq(entradasBrutas.id, comErro));
    expect(terceira.tentativas).toBe(3);
  });
});
