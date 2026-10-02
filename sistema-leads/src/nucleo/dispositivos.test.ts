import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { temBanco } from "./teste/banco";
import { db } from "@/db";
import { dispositivos } from "@/db/schema";
import {
  autenticarDispositivo,
  extrairBearer,
  gerarTokenDispositivo,
  hashToken,
} from "./dispositivos";

describe("token do dispositivo", () => {
  it("gera tokens diferentes com prefixo pio_ e 32 bytes em base64url", () => {
    const a = gerarTokenDispositivo();
    const b = gerarTokenDispositivo();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^pio_[A-Za-z0-9_-]{43}$/);
  });

  it("hash é sha256 hex estável e muda com o token", () => {
    const token = gerarTokenDispositivo();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toBe(hashToken(gerarTokenDispositivo()));
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("extrai o token do header Bearer", () => {
    expect(extrairBearer("Bearer pio_abc")).toBe("pio_abc");
    expect(extrairBearer("bearer   pio_abc ")).toBe("pio_abc");
    expect(extrairBearer("Basic xyz")).toBeNull();
    expect(extrairBearer("Bearer")).toBeNull();
    expect(extrairBearer(null)).toBeNull();
  });
});

describe.skipIf(!temBanco)("autenticarDispositivo (integração)", () => {
  const ids: string[] = [];

  afterAll(async () => {
    for (const id of ids) await db.delete(dispositivos).where(eq(dispositivos.id, id));
  });

  const requisicao = (cabecalho?: string) =>
    new Request("http://localhost/api/ingest/heartbeat", {
      method: "POST",
      headers: cabecalho ? { authorization: cabecalho } : {},
    });

  it("aceita o token certo, recusa errado, ausente e dispositivo inativo", async () => {
    const token = gerarTokenDispositivo();
    const [d] = await db
      .insert(dispositivos)
      .values({ nome: `Teste ${randomUUID()}`, tokenHash: hashToken(token) })
      .returning();
    ids.push(d.id);

    expect((await autenticarDispositivo(requisicao(`Bearer ${token}`)))?.id).toBe(d.id);
    expect(await autenticarDispositivo(requisicao(`Bearer ${gerarTokenDispositivo()}`))).toBeNull();
    expect(await autenticarDispositivo(requisicao("Bearer qualquer-coisa"))).toBeNull();
    expect(await autenticarDispositivo(requisicao())).toBeNull();

    await db.update(dispositivos).set({ ativo: false }).where(eq(dispositivos.id, d.id));
    expect(await autenticarDispositivo(requisicao(`Bearer ${token}`))).toBeNull();
  });
});
