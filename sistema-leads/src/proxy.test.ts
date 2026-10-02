import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

// Os webhooks têm autenticação própria (segredo ou assinatura) e não podem passar pelo proxy,
// que exige o cookie de sessão: senão receberiam 401 ou um redirect para /login.

describe("matcher do proxy", () => {
  it("não intercepta os webhooks nem a ingestão (respondem sem cookie)", () => {
    for (const url of [
      "/api/webhooks/framer?k=x",
      "/api/webhooks/meta",
      "/api/webhooks/meta?hub.mode=subscribe",
      "/api/ingest/whatsapp",
      "/api/cron/reprocessar",
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
    }
  });

  it("intercepta as telas e as demais rotas internas", () => {
    for (const url of ["/", "/leads", "/kanban", "/api/qualquer"]) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(true);
    }
  });
});
