import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { ConfigApi, Resultado } from "../src/background/api";
import { avancar, maiorEnviadaEm } from "../src/background/checkpoint";
import { Enviador, TRAVA_EXPIRA_MS } from "../src/background/envio";
import { EstadoDeExecucao, armazenamentoMemoria } from "../src/background/estado-execucao";
import { FilaIndexedDb } from "../src/background/fila";
import type { Heartbeat, LoteIngestao, RespostaHeartbeat, RespostaIngestao } from "../src/shared/protocol";
import { item } from "./apoio";

const NUM = "5562999999999";
const CFG: ConfigApi = { urlSistema: "http://localhost:3000", token: "pio_x" };
const T0 = Date.parse("2026-10-03T12:00:00Z");

type RespostaLote = (lote: LoteIngestao) => Resultado<RespostaIngestao>;

function aceitarTudo(lote: LoteIngestao): Resultado<RespostaIngestao> {
  return { tipo: "ok", status: 200, dados: { aceitos: lote.itens.map((i) => i.wa_msg_id), erros: [] } };
}

function montar(respostaLote: RespostaLote = aceitarTudo) {
  let agora = T0;
  const fila = new FilaIndexedDb(new IDBFactory());
  const sessao = armazenamentoMemoria();
  const estado = new EstadoDeExecucao(sessao);
  const lotes: LoteIngestao[] = [];
  const heartbeats: Heartbeat[] = [];
  const checkpoints: Record<string, string> = {};
  let config: ConfigApi | null = CFG;
  let respostaHb: Resultado<RespostaHeartbeat> = {
    tipo: "ok",
    status: 200,
    dados: { ultimo_sync_servidor: "2026-10-02T10:00:00.000Z", padroes_texto: ["gestao na veia"] },
  };
  let resposta = respostaLote;
  const enviador = new Enviador({
    fila,
    estado,
    lerConfig: async () => config,
    enviarLote: async (_cfg, lote) => {
      lotes.push(lote);
      return resposta(lote);
    },
    enviarHeartbeat: async (_cfg, corpo) => {
      heartbeats.push(corpo);
      return respostaHb;
    },
    lerCheckpoint: async (n) => checkpoints[n] ?? null,
    avancarCheckpoint: async (n, iso) => {
      Object.assign(checkpoints, avancar(checkpoints, n, iso));
    },
    versaoExtensao: "0.1.0",
    agora: () => agora,
  });
  return {
    fila,
    estado,
    sessao,
    enviador,
    lotes,
    heartbeats,
    checkpoints,
    avancarRelogio: (ms: number) => (agora += ms),
    trocarResposta: (r: RespostaLote) => (resposta = r),
    trocarHeartbeat: (r: Resultado<RespostaHeartbeat>) => (respostaHb = r),
    trocarConfig: (c: ConfigApi | null) => (config = c),
  };
}

function itens(n: number, base = 0) {
  return Array.from({ length: n }, (_, i) =>
    item(`m${base + i}`, new Date(T0 - (n - i) * 60_000).toISOString(), i % 2 ? "out" : "in"),
  );
}

describe("esvaziarFila", () => {
  it("envia em lotes de até 100, remove os aceitos e avança o checkpoint", async () => {
    const t = montar();
    await t.fila.enfileirar(NUM, itens(250));
    const r = await t.enviador.esvaziarFila(NUM);
    expect(r).toMatchObject({ motivo: "fila_vazia", lotes: 3, aceitos: 250, rejeitados: 0 });
    expect(t.lotes.map((l) => l.itens.length)).toEqual([100, 100, 50]);
    expect(t.lotes[0]).toMatchObject({ versao_extensao: "0.1.0", numero_monitorado: NUM });
    expect(await t.fila.tamanho(NUM)).toBe(0);
    expect(t.checkpoints[NUM]).toBe(new Date(T0 - 60_000).toISOString());
    const est = await t.estado.ler();
    expect(est.ultimo_envio?.aceitos).toBe(250);
    expect(est.envio_em_andamento_desde).toBeNull();
  });

  it("move os erros para rejeitados e mantém o checkpoint só dos aceitos", async () => {
    const t = montar((lote) => ({
      tipo: "ok",
      status: 200,
      dados: {
        aceitos: lote.itens.filter((i) => i.wa_msg_id !== "m2").map((i) => i.wa_msg_id),
        erros: [{ wa_msg_id: "m2", motivo: "Item inválido" }],
      },
    }));
    await t.fila.enfileirar(NUM, itens(3));
    const r = await t.enviador.esvaziarFila(NUM);
    expect(r).toMatchObject({ aceitos: 2, rejeitados: 1 });
    expect(await t.fila.tamanho(NUM)).toBe(0);
    expect(await t.fila.totalRejeitados()).toBe(1);
  });

  it("rede: mantém na fila, backoff 1, 2, 4, 5, 5 min e volta ao normal depois", async () => {
    const t = montar(() => ({ tipo: "rede", status: null, mensagem: "Sem conexão" }));
    await t.fila.enfileirar(NUM, itens(2));
    const esperas: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await t.enviador.esvaziarFila(NUM);
      expect(r.motivo).toBe("falha");
      const est = await t.estado.ler();
      expect(est.ultimo_erro?.tipo).toBe("rede");
      const espera = Date.parse(est.proximo_envio_em as string) - T0 - esperas.reduce((a, b) => a + b, 0);
      esperas.push(espera);
      // Antes do prazo: nem tenta.
      const enviadosAntes = t.lotes.length;
      expect((await t.enviador.esvaziarFila(NUM)).motivo).toBe("backoff");
      expect(t.lotes.length).toBe(enviadosAntes);
      t.avancarRelogio(espera);
    }
    expect(esperas.map((ms) => ms / 60_000)).toEqual([1, 2, 4, 5, 5]);
    expect(await t.fila.tamanho(NUM)).toBe(2);
    // A internet volta.
    t.trocarResposta(aceitarTudo);
    expect((await t.enviador.esvaziarFila(NUM)).motivo).toBe("fila_vazia");
    const est = await t.estado.ler();
    expect(est).toMatchObject({ falhas_seguidas: 0, proximo_envio_em: null, ultimo_erro: null });
  });

  it("5xx também aplica backoff; ignorarBackoff força a tentativa", async () => {
    const t = montar(() => ({ tipo: "erro_servidor", status: 503, mensagem: "Erro 503" }));
    await t.fila.enfileirar(NUM, itens(1));
    await t.enviador.esvaziarFila(NUM);
    expect((await t.estado.ler()).proximo_envio_em).not.toBeNull();
    t.trocarResposta(aceitarTudo);
    expect((await t.enviador.esvaziarFila(NUM)).motivo).toBe("backoff");
    expect((await t.enviador.esvaziarFila(NUM, { ignorarBackoff: true })).motivo).toBe("fila_vazia");
  });

  it("401: para, marca token inválido e não envia mais", async () => {
    const t = montar(() => ({ tipo: "token_invalido", status: 401, mensagem: "Token inválido (401)." }));
    await t.fila.enfileirar(NUM, itens(150));
    expect((await t.enviador.esvaziarFila(NUM)).motivo).toBe("token_invalido");
    expect(t.lotes.length).toBe(1);
    expect((await t.estado.ler()).token_invalido).toBe(true);
    expect((await t.enviador.esvaziarFila(NUM, { ignorarBackoff: true })).motivo).toBe("token_invalido");
    expect(t.lotes.length).toBe(1);
    expect(await t.enviador.heartbeat(NUM)).toBeNull();
    expect(await t.fila.tamanho(NUM)).toBe(150);
  });

  it("400: isola item a item, rejeita só o ruim e mantém os demais", async () => {
    const t = montar((lote) => {
      if (lote.itens.length > 1) return { tipo: "erro_cliente", status: 400, mensagem: "Erro 400: Corpo inválido" };
      if (lote.itens[0].wa_msg_id === "m1") return { tipo: "erro_cliente", status: 400, mensagem: "Erro 400: item ruim" };
      return aceitarTudo(lote);
    });
    await t.fila.enfileirar(NUM, itens(3));
    const r = await t.enviador.esvaziarFila(NUM);
    expect(r).toMatchObject({ aceitos: 2, rejeitados: 1 });
    expect(t.lotes.map((l) => l.itens.length)).toEqual([3, 1, 1, 1]);
    const [rej] = await t.fila.listarRejeitados();
    expect(rej.wa_msg_id).toBe("m1");
    expect(rej.motivo).toContain("item ruim");
    expect((await t.estado.ler()).ultimo_erro?.tipo).toBe("erro_cliente");
  });

  it("400 em todos os itens: problema do lote, nada é rejeitado e entra em backoff", async () => {
    const t = montar(() => ({ tipo: "erro_cliente", status: 400, mensagem: "Erro 400: numero_monitorado" }));
    await t.fila.enfileirar(NUM, itens(3));
    expect((await t.enviador.esvaziarFila(NUM)).motivo).toBe("falha");
    expect(await t.fila.tamanho(NUM)).toBe(3);
    expect(await t.fila.totalRejeitados()).toBe(0);
    expect((await t.estado.ler()).proximo_envio_em).not.toBeNull();
  });

  it("erro sem wa_msg_id: isola os itens não citados", async () => {
    const t = montar((lote) =>
      lote.itens.length > 1
        ? { tipo: "ok", status: 200, dados: { aceitos: ["m0"], erros: [{ wa_msg_id: null, motivo: "Item inválido" }] } }
        : { tipo: "ok", status: 200, dados: { aceitos: [], erros: [{ wa_msg_id: null, motivo: "Item inválido" }] } },
    );
    await t.fila.enfileirar(NUM, itens(2));
    const r = await t.enviador.esvaziarFila(NUM);
    expect(r).toMatchObject({ aceitos: 1, rejeitados: 1 });
    expect(await t.fila.tamanho(NUM)).toBe(0);
  });

  it("uma rodada por vez: chamadas simultâneas compartilham a mesma rodada", async () => {
    const t = montar();
    await t.fila.enfileirar(NUM, itens(5));
    const [a, b] = await Promise.all([t.enviador.esvaziarFila(NUM), t.enviador.esvaziarFila(NUM)]);
    expect(a).toBe(b);
    expect(t.lotes.length).toBe(1);
  });

  it("carimbo de rodada de outra vida do worker: espera expirar (2 min)", async () => {
    const t = montar();
    await t.fila.enfileirar(NUM, itens(1));
    await t.estado.atualizar({ envio_em_andamento_desde: T0 - 30_000 });
    expect((await t.enviador.esvaziarFila(NUM)).motivo).toBe("em_andamento");
    t.avancarRelogio(TRAVA_EXPIRA_MS);
    expect((await t.enviador.esvaziarFila(NUM)).motivo).toBe("fila_vazia");
  });

  it("sem configuração não envia", async () => {
    const t = montar();
    t.trocarConfig(null);
    await t.fila.enfileirar(NUM, itens(1));
    expect((await t.enviador.esvaziarFila(NUM)).motivo).toBe("sem_config");
    expect(t.lotes.length).toBe(0);
  });
});

describe("heartbeat", () => {
  it("manda fila_pendente e checkpoint; guarda sync e padrões", async () => {
    const t = montar();
    await t.fila.enfileirar(NUM, itens(4));
    t.checkpoints[NUM] = "2026-10-01T00:00:00.000Z";
    const r = await t.enviador.heartbeat(NUM);
    expect(r?.tipo).toBe("ok");
    expect(t.heartbeats[0]).toEqual({
      numero_monitorado: NUM,
      versao_extensao: "0.1.0",
      fila_pendente: 4,
      ultimo_sync_em: "2026-10-01T00:00:00.000Z",
    });
    const est = await t.estado.ler();
    expect(est.ultimo_heartbeat_em).toBe(new Date(T0).toISOString());
    expect(est.ultimo_sync_servidor).toBe("2026-10-02T10:00:00.000Z");
    expect(est.padroes_texto).toEqual(["gestao na veia"]);
    // Persistido no armazenamento da sessão (sobrevive ao sono do worker).
    expect(t.sessao.atual?.ultimo_heartbeat_em).toBe(new Date(T0).toISOString());
  });

  it("401 no heartbeat marca token inválido; rede só registra o erro", async () => {
    const t = montar();
    t.trocarHeartbeat({ tipo: "rede", status: null, mensagem: "Sem conexão" });
    await t.enviador.heartbeat(NUM);
    let est = await t.estado.ler();
    expect(est.ultimo_erro?.tipo).toBe("rede");
    expect(est.token_invalido).toBe(false);
    expect(est.proximo_envio_em).toBeNull();
    t.trocarHeartbeat({ tipo: "token_invalido", status: 401, mensagem: "Token inválido (401)." });
    await t.enviador.heartbeat(NUM);
    est = await t.estado.ler();
    expect(est.token_invalido).toBe(true);
    expect(est.ultimo_erro?.mensagem).toContain("Heartbeat");
  });
});

describe("checkpoint", () => {
  it("só avança para frente", () => {
    const m1 = avancar({}, NUM, "2026-10-02T10:00:00Z");
    expect(m1[NUM]).toBe("2026-10-02T10:00:00.000Z");
    expect(avancar(m1, NUM, "2026-10-01T10:00:00Z")).toBe(m1);
    expect(avancar(m1, NUM, "2026-10-03T10:00:00Z")[NUM]).toBe("2026-10-03T10:00:00.000Z");
    expect(maiorEnviadaEm([item("a", "2026-10-02T10:00:00Z"), item("b", "2026-10-02T11:00:00Z")])).toBe(
      "2026-10-02T11:00:00.000Z",
    );
    expect(maiorEnviadaEm([])).toBeNull();
  });
});
