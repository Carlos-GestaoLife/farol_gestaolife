import { createHash, timingSafeEqual } from "node:crypto";

// Segredos dos webhooks e comparação em tempo constante.
//
// Os segredos dos webhooks são lidos direto de `process.env` a cada chamada (e não pelo
// `getEnv()`, que exige DATABASE_URL e guarda cache): assim a rota responde 503 com uma
// mensagem clara quando o segredo falta, e os testes podem definir o segredo na hora.

export type NomeSegredo =
  | "META_APP_SECRET"
  | "META_VERIFY_TOKEN"
  | "META_PAGE_ACCESS_TOKEN"
  | "FRAMER_WEBHOOK_SECRET"
  | "CRON_SECRET";

/** Valor do segredo, ou undefined se não estiver definido (vazio conta como ausente). */
export function lerSegredo(nome: NomeSegredo): string | undefined {
  const valor = process.env[nome]?.trim();
  return valor ? valor : undefined;
}

/**
 * Compara duas strings em tempo constante. Compara o sha256 das duas (mesmo tamanho sempre),
 * então nem o tamanho do segredo vaza pelo tempo de resposta.
 */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}
