import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("aceita DATABASE_URL válida e deixa as demais opcionais", () => {
    const env = parseEnv({ DATABASE_URL: "postgresql://leads:leads@localhost:5433/leads_test" });
    expect(env.DATABASE_URL).toBe("postgresql://leads:leads@localhost:5433/leads_test");
    expect(env.CRON_SECRET).toBeUndefined();
  });

  it("falha sem DATABASE_URL", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("falha com DATABASE_URL que não é Postgres", () => {
    expect(() => parseEnv({ DATABASE_URL: "mysql://localhost/x" })).toThrow(/DATABASE_URL/);
  });

  it("trata variável vazia como ausente", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://localhost/x", CRON_SECRET: "" });
    expect(env.CRON_SECRET).toBeUndefined();
  });
});
