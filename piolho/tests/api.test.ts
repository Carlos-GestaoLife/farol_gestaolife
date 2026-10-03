import { describe, expect, it } from "vitest";
import { ROTAS, enviarHeartbeat, enviarLote, type FetchLike } from "../src/background/api";
import { calcularBackoffMs } from "../src/background/backoff";

const CFG = { urlSistema: "http://localhost:3000", token: "pio_tokenSecretoDeTeste1234567890" };
const HB = { numero_monitorado: "5562999999999", versao_extensao: "0.1.0", fila_pendente: 3, ultimo_sync_em: null };
const LOTE = { versao_extensao: "0.1.0", numero_monitorado: "5562999999999", itens: [] };

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

/** fetch falso que registra a chamada e devolve a resposta dada. */
function fetchFalso(resposta: Response | (() => Promise<Response>)) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const f: FetchLike = async (url, init) => {
    chamadas.push({ url, init });
    return typeof resposta === "function" ? resposta() : resposta;
  };
  return { f, chamadas };
}

describe("cliente HTTP: classificação das respostas", () => {
  it("200 do heartbeat: ok, com headers e corpo certos", async () => {
    const { f, chamadas } = fetchFalso(json(200, { ultimo_sync_servidor: null, padroes_texto: ["gestao na veia"] }));
    const r = await enviarHeartbeat(CFG, HB, { fetch: f });
    expect(r).toEqual({ tipo: "ok", status: 200, dados: { ultimo_sync_servidor: null, padroes_texto: ["gestao na veia"] } });
    expect(chamadas[0].url).toBe(`http://localhost:3000${ROTAS.heartbeat}`);
    const headers = chamadas[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${CFG.token}`);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(chamadas[0].init.method).toBe("POST");
    expect(JSON.parse(chamadas[0].init.body as string)).toEqual(HB);
  });

  it("200 da ingestão: ok com aceitos e erros", async () => {
    const { f, chamadas } = fetchFalso(json(200, { aceitos: ["a"], erros: [{ wa_msg_id: "b", motivo: "x" }] }));
    const r = await enviarLote(CFG, LOTE, { fetch: f });
    expect(r.tipo).toBe("ok");
    expect(chamadas[0].url).toBe(`http://localhost:3000${ROTAS.whatsapp}`);
  });

  it("401: token_invalido", async () => {
    const r = await enviarLote(CFG, LOTE, { fetch: fetchFalso(json(401, { erro: "Token inválido" })).f });
    expect(r.tipo).toBe("token_invalido");
    expect(r.status).toBe(401);
  });

  it("400: erro_cliente com o corpo", async () => {
    const r = await enviarLote(CFG, LOTE, { fetch: fetchFalso(json(400, { erro: "Corpo inválido: itens" })).f });
    expect(r.tipo).toBe("erro_cliente");
    if (r.tipo !== "erro_cliente") throw new Error();
    expect(r.mensagem).toContain("Corpo inválido: itens");
    expect(r.corpo).toEqual({ erro: "Corpo inválido: itens" });
  });

  it("500 e 503: erro_servidor (inclusive corpo que não é JSON)", async () => {
    expect((await enviarLote(CFG, LOTE, { fetch: fetchFalso(json(500, { erro: "x" })).f })).tipo).toBe("erro_servidor");
    const r = await enviarLote(CFG, LOTE, { fetch: fetchFalso(new Response("<html>Bad gateway</html>", { status: 503 })).f });
    expect(r.tipo).toBe("erro_servidor");
  });

  it("200 fora do contrato: resposta_invalida", async () => {
    const r = await enviarLote(CFG, LOTE, { fetch: fetchFalso(json(200, { ok: true })).f });
    expect(r.tipo).toBe("resposta_invalida");
  });

  it("fetch que falha: rede", async () => {
    const r = await enviarLote(CFG, LOTE, {
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(r.tipo).toBe("rede");
    expect(r.status).toBeNull();
  });

  it("sem resposta no tempo limite: rede (abortado)", async () => {
    const lento: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const r = await enviarLote(CFG, LOTE, { fetch: lento, timeoutMs: 30 });
    expect(r.tipo).toBe("rede");
    if (r.tipo !== "rede") throw new Error();
    expect(r.mensagem).toContain("Sem resposta");
  });

  it("o token nunca aparece no resultado", async () => {
    const respostas = [
      json(401, { erro: "x" }),
      json(400, { erro: "x" }),
      json(500, {}),
      json(200, { aceitos: [], erros: [] }),
    ];
    for (const resp of respostas) {
      const r = await enviarLote(CFG, LOTE, { fetch: fetchFalso(resp).f });
      expect(JSON.stringify(r)).not.toContain(CFG.token);
    }
    const rede = await enviarLote(CFG, LOTE, {
      fetch: async () => {
        throw new Error("falhou");
      },
    });
    expect(JSON.stringify(rede)).not.toContain(CFG.token);
  });
});

describe("backoff", () => {
  it("segue 1, 2, 4, 5, 5 minutos", () => {
    const minutos = [1, 2, 3, 4, 5].map((n) => calcularBackoffMs(n) / 60_000);
    expect(minutos).toEqual([1, 2, 4, 5, 5]);
    expect(calcularBackoffMs(100)).toBe(5 * 60_000);
    expect(calcularBackoffMs(0)).toBe(0);
  });
});
