import { describe, expect, it } from "vitest";
import { parseDatabaseUrl, parseEnv } from "./env";

const BASE = {
  DATABASE_URL: "postgresql://leads:leads@localhost:5433/leads_test",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("aceita as obrigatórias válidas e deixa as demais opcionais", () => {
    const env = parseEnv(BASE);
    expect(env.DATABASE_URL).toBe(BASE.DATABASE_URL);
    expect(env.BETTER_AUTH_URL).toBe(BASE.BETTER_AUTH_URL);
    expect(env.CRON_SECRET).toBeUndefined();
  });

  it("falha sem DATABASE_URL", () => {
    expect(() => parseEnv({ ...BASE, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it("falha com DATABASE_URL que não é Postgres", () => {
    expect(() => parseEnv({ ...BASE, DATABASE_URL: "mysql://localhost/x" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("falha sem BETTER_AUTH_SECRET", () => {
    expect(() => parseEnv({ ...BASE, BETTER_AUTH_SECRET: undefined })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it("falha com BETTER_AUTH_SECRET menor que 32 caracteres", () => {
    expect(() => parseEnv({ ...BASE, BETTER_AUTH_SECRET: "curto" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it("falha sem BETTER_AUTH_URL ou com URL inválida", () => {
    expect(() => parseEnv({ ...BASE, BETTER_AUTH_URL: undefined })).toThrow(/BETTER_AUTH_URL/);
    expect(() => parseEnv({ ...BASE, BETTER_AUTH_URL: "nao-e-url" })).toThrow(/BETTER_AUTH_URL/);
  });

  it("trata variável vazia como ausente", () => {
    const env = parseEnv({ ...BASE, CRON_SECRET: "" });
    expect(env.CRON_SECRET).toBeUndefined();
    expect(() => parseEnv({ ...BASE, BETTER_AUTH_SECRET: "" })).toThrow(/BETTER_AUTH_SECRET/);
  });
});

describe("parseDatabaseUrl", () => {
  it("valida só a DATABASE_URL, sem exigir as variáveis do auth", () => {
    expect(parseDatabaseUrl({ DATABASE_URL: BASE.DATABASE_URL })).toBe(BASE.DATABASE_URL);
  });

  it("falha sem DATABASE_URL ou com formato inválido", () => {
    expect(() => parseDatabaseUrl({})).toThrow(/DATABASE_URL/);
    expect(() => parseDatabaseUrl({ DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
  });
});
