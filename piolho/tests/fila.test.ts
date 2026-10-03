import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { FilaIndexedDb, LIMITE_REJEITADOS } from "../src/background/fila";
import { item } from "./apoio";

const NUM = "5562999999999";
const OUTRO = "5562911112222";

function novaFila(): FilaIndexedDb {
  // Uma fábrica nova por teste: bancos isolados.
  return new FilaIndexedDb(new IDBFactory());
}

describe("FilaIndexedDb", () => {
  it("enfileira sem duplicar (mesma chave numero:wa_msg_id)", async () => {
    const fila = novaFila();
    expect(await fila.enfileirar(NUM, [item("a", "2026-10-02T10:00:00Z"), item("b", "2026-10-02T10:01:00Z")])).toBe(2);
    expect(await fila.enfileirar(NUM, [item("a", "2026-10-02T10:00:00Z"), item("a", "2026-10-02T10:00:00Z")])).toBe(0);
    expect(await fila.tamanho(NUM)).toBe(2);
    // O mesmo wa_msg_id em outro número é outra chave.
    expect(await fila.enfileirar(OUTRO, [item("a", "2026-10-02T10:00:00Z")])).toBe(1);
    expect(await fila.tamanho(NUM)).toBe(2);
    expect(await fila.tamanho(OUTRO)).toBe(1);
    expect(await fila.tamanho()).toBe(3);
  });

  it("lote em ordem de enviada_em, só do número pedido, respeitando o limite", async () => {
    const fila = novaFila();
    await fila.enfileirar(NUM, [
      item("c", "2026-10-02T10:03:00Z"),
      item("a", "2026-10-02T10:01:00Z"),
      item("b", "2026-10-02T10:02:00Z"),
    ]);
    await fila.enfileirar(OUTRO, [item("x", "2026-10-02T09:00:00Z")]);
    expect((await fila.proximoLote(NUM)).map((i) => i.wa_msg_id)).toEqual(["a", "b", "c"]);
    expect((await fila.proximoLote(NUM, 2)).map((i) => i.wa_msg_id)).toEqual(["a", "b"]);
    expect((await fila.proximoLote(OUTRO)).map((i) => i.wa_msg_id)).toEqual(["x"]);
  });

  it("mesma enviada_em: ordem de chegada", async () => {
    const fila = novaFila();
    await fila.enfileirar(NUM, [item("primeiro", "2026-10-02T10:00:00Z"), item("segundo", "2026-10-02T10:00:00Z")]);
    expect((await fila.proximoLote(NUM)).map((i) => i.wa_msg_id)).toEqual(["primeiro", "segundo"]);
  });

  it("confirmar aceitos remove só os aceitos daquele número", async () => {
    const fila = novaFila();
    await fila.enfileirar(NUM, [item("a", "2026-10-02T10:00:00Z"), item("b", "2026-10-02T10:01:00Z")]);
    await fila.enfileirar(OUTRO, [item("a", "2026-10-02T10:00:00Z")]);
    await fila.confirmarAceitos(NUM, ["a", "inexistente"]);
    expect((await fila.proximoLote(NUM)).map((i) => i.wa_msg_id)).toEqual(["b"]);
    expect(await fila.tamanho(OUTRO)).toBe(1);
  });

  it("erro definitivo move para rejeitados (com o item) e tira da fila", async () => {
    const fila = novaFila();
    await fila.enfileirar(NUM, [item("a", "2026-10-02T10:00:00Z"), item("b", "2026-10-02T10:01:00Z")]);
    await fila.marcarErroDefinitivo(NUM, [{ wa_msg_id: "a", motivo: "Item inválido: tipo_midia" }]);
    expect(await fila.tamanho(NUM)).toBe(1);
    expect(await fila.totalRejeitados()).toBe(1);
    const [rej] = await fila.listarRejeitados();
    expect(rej.motivo).toBe("Item inválido: tipo_midia");
    expect(rej.item?.wa_msg_id).toBe("a");
  });

  it(`rejeitados limitados aos ${LIMITE_REJEITADOS} mais recentes`, async () => {
    const fila = novaFila();
    const total = LIMITE_REJEITADOS + 20;
    const itens = Array.from({ length: total }, (_, i) => item(`m${i}`, "2026-10-02T10:00:00Z"));
    await fila.enfileirar(NUM, itens);
    // Em dois lotes, para conferir o corte entre chamadas.
    await fila.marcarErroDefinitivo(NUM, itens.slice(0, 300).map((i) => ({ wa_msg_id: i.wa_msg_id, motivo: "x" })));
    await fila.marcarErroDefinitivo(NUM, itens.slice(300).map((i) => ({ wa_msg_id: i.wa_msg_id, motivo: "x" })));
    expect(await fila.totalRejeitados()).toBe(LIMITE_REJEITADOS);
    const recentes = await fila.listarRejeitados(LIMITE_REJEITADOS);
    const ids = new Set(recentes.map((r) => r.wa_msg_id));
    expect(ids.has(`m${total - 1}`)).toBe(true);
    expect(ids.has("m0")).toBe(false);
    expect(ids.has("m19")).toBe(false);
    expect(ids.has("m20")).toBe(true);
    expect(await fila.tamanho(NUM)).toBe(0);
  });

  it("limparTudo zera fila e rejeitados", async () => {
    const fila = novaFila();
    await fila.enfileirar(NUM, [item("a", "2026-10-02T10:00:00Z"), item("b", "2026-10-02T10:00:00Z")]);
    await fila.marcarErroDefinitivo(NUM, [{ wa_msg_id: "a", motivo: "x" }]);
    await fila.limparTudo();
    expect(await fila.tamanho()).toBe(0);
    expect(await fila.totalRejeitados()).toBe(0);
  });
});
