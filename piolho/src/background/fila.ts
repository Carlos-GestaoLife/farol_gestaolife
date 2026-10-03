// Fila local de mensagens a enviar ao servidor (dona: o service worker), em IndexedDB.
//
// Regra de ouro "nada se perde": toda mensagem entra aqui antes do envio e só sai quando o
// servidor devolver o wa_msg_id em `aceitos`. A chave é `${numero}:${wa_msg_id}` (a mesma
// composição da chave de idempotência do servidor), então enfileirar de novo a mesma mensagem
// (escuta ao vivo e varredura) não duplica, e duas contas no mesmo computador não se misturam.
//
// Banco "piolho":
// - store "fila": chave `chave`; índices "por_enfileirado" (enfileirado_em) e "por_numero_envio"
//   ([numero, enviada_ms, enfileirado_em], para o lote sair em ordem cronológica por número).
// - store "rejeitados": itens que o servidor recusou (aparecem em `erros`). Não voltam para a fila,
//   mas também não somem: ficam aqui com o motivo, limitados aos 500 mais recentes.
import type { ItemMensagem } from "../shared/protocol";

export const NOME_BANCO = "piolho";
export const VERSAO_BANCO = 1;
export const LIMITE_REJEITADOS = 500;

export interface RegistroFila {
  chave: string;
  numero: string;
  wa_msg_id: string;
  /** Date.parse(item.enviada_em), para ordenar. */
  enviada_ms: number;
  enfileirado_em: number;
  item: ItemMensagem;
}

export interface RegistroRejeitado {
  id?: number;
  chave: string;
  numero: string;
  wa_msg_id: string;
  motivo: string;
  rejeitado_em: number;
  item: ItemMensagem | null;
}

export interface ErroRejeicao {
  wa_msg_id: string;
  motivo: string;
}

export interface Fila {
  /** Grava os itens do número (ignora chave já presente). Devolve quantos entraram de fato. */
  enfileirar(numero: string, itens: ItemMensagem[]): Promise<number>;
  /** Até `limite` itens do número, em ordem de enviada_em (depois enfileirado_em), sem remover. */
  proximoLote(numero: string, limite?: number): Promise<ItemMensagem[]>;
  /** Remove da fila só os wa_msg_id aceitos pelo servidor. */
  confirmarAceitos(numero: string, waMsgIds: string[]): Promise<void>;
  /** Move para "rejeitados" os itens que o servidor recusou, com o motivo. */
  marcarErroDefinitivo(numero: string, erros: ErroRejeicao[]): Promise<void>;
  /** Itens pendentes do número (ou de todos). Vai no heartbeat como fila_pendente. */
  tamanho(numero?: string): Promise<number>;
  /** Quantidade de rejeitados guardados. */
  totalRejeitados(): Promise<number>;
  /** Apaga fila e rejeitados. */
  limparTudo(): Promise<void>;
}

export function chaveFila(numero: string, waMsgId: string): string {
  return `${numero}:${waMsgId}`;
}

/** Promessa de uma IDBRequest. */
function pedido<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha no IndexedDB."));
  });
}

/** Promessa do fim de uma transação (commit). */
function concluida(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Falha na transação do IndexedDB."));
    tx.onabort = () => reject(tx.error ?? new Error("Transação do IndexedDB abortada."));
  });
}

function faixaDoNumero(numero: string): IDBKeyRange {
  return IDBKeyRange.bound([numero, -Infinity, -Infinity], [numero, Infinity, Infinity]);
}

export class FilaIndexedDb implements Fila {
  private banco: Promise<IDBDatabase> | null = null;

  /** @param fabrica IndexedDB a usar (testes passam o do fake-indexeddb). */
  constructor(
    private readonly fabrica: IDBFactory = globalThis.indexedDB,
    private readonly nomeBanco: string = NOME_BANCO,
  ) {}

  private abrir(): Promise<IDBDatabase> {
    if (this.banco) return this.banco;
    this.banco = new Promise<IDBDatabase>((resolve, reject) => {
      const req = this.fabrica.open(this.nomeBanco, VERSAO_BANCO);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("fila")) {
          const fila = db.createObjectStore("fila", { keyPath: "chave" });
          fila.createIndex("por_enfileirado", "enfileirado_em");
          fila.createIndex("por_numero_envio", ["numero", "enviada_ms", "enfileirado_em"]);
          fila.createIndex("por_numero", "numero");
        }
        if (!db.objectStoreNames.contains("rejeitados")) {
          const rej = db.createObjectStore("rejeitados", { keyPath: "id", autoIncrement: true });
          rej.createIndex("por_rejeitado", "rejeitado_em");
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // Outra versão abriu o banco: fecha e reabre na próxima chamada.
        db.onversionchange = () => {
          db.close();
          this.banco = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        this.banco = null;
        reject(req.error ?? new Error("Não consegui abrir o IndexedDB."));
      };
    });
    return this.banco;
  }

  async enfileirar(numero: string, itens: ItemMensagem[]): Promise<number> {
    if (itens.length === 0) return 0;
    const db = await this.abrir();
    const tx = db.transaction("fila", "readwrite");
    const store = tx.objectStore("fila");
    const fim = concluida(tx);
    let novos = 0;
    const agora = Date.now();
    const vistos = new Set<string>();
    for (const [i, item] of itens.entries()) {
      const chave = chaveFila(numero, item.wa_msg_id);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const existente = await pedido(store.getKey(chave));
      if (existente !== undefined) continue;
      const enviadaMs = Date.parse(item.enviada_em);
      const registro: RegistroFila = {
        chave,
        numero,
        wa_msg_id: item.wa_msg_id,
        enviada_ms: Number.isFinite(enviadaMs) ? enviadaMs : agora,
        // + i: mantém a ordem de chegada dentro da mesma chamada.
        enfileirado_em: agora + i / 1000,
        item,
      };
      store.add(registro);
      novos++;
    }
    await fim;
    return novos;
  }

  async proximoLote(numero: string, limite: number = 100): Promise<ItemMensagem[]> {
    const db = await this.abrir();
    const tx = db.transaction("fila", "readonly");
    const indice = tx.objectStore("fila").index("por_numero_envio");
    const registros = (await pedido(indice.getAll(faixaDoNumero(numero), limite))) as RegistroFila[];
    return registros.map((r) => r.item);
  }

  async confirmarAceitos(numero: string, waMsgIds: string[]): Promise<void> {
    if (waMsgIds.length === 0) return;
    const db = await this.abrir();
    const tx = db.transaction("fila", "readwrite");
    const store = tx.objectStore("fila");
    for (const id of new Set(waMsgIds)) store.delete(chaveFila(numero, id));
    await concluida(tx);
  }

  async marcarErroDefinitivo(numero: string, erros: ErroRejeicao[]): Promise<void> {
    if (erros.length === 0) return;
    const db = await this.abrir();
    const tx = db.transaction(["fila", "rejeitados"], "readwrite");
    const fim = concluida(tx);
    const fila = tx.objectStore("fila");
    const rejeitados = tx.objectStore("rejeitados");
    const agora = Date.now();
    for (const [i, erro] of erros.entries()) {
      const chave = chaveFila(numero, erro.wa_msg_id);
      const registro = (await pedido(fila.get(chave))) as RegistroFila | undefined;
      const rejeitado: RegistroRejeitado = {
        chave,
        numero,
        wa_msg_id: erro.wa_msg_id,
        motivo: erro.motivo.slice(0, 1000),
        rejeitado_em: agora + i / 1000,
        item: registro?.item ?? null,
      };
      rejeitados.add(rejeitado);
      fila.delete(chave);
    }
    // Mantém só os LIMITE_REJEITADOS mais recentes.
    const total = await pedido(rejeitados.count());
    let excesso = total - LIMITE_REJEITADOS;
    if (excesso > 0) {
      await new Promise<void>((resolve, reject) => {
        const cursor = rejeitados.index("por_rejeitado").openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c || excesso <= 0) return resolve();
          c.delete();
          excesso--;
          c.continue();
        };
        cursor.onerror = () => reject(cursor.error);
      });
    }
    await fim;
  }

  async tamanho(numero?: string): Promise<number> {
    const db = await this.abrir();
    const tx = db.transaction("fila", "readonly");
    const store = tx.objectStore("fila");
    if (numero === undefined) return pedido(store.count());
    return pedido(store.index("por_numero").count(IDBKeyRange.only(numero)));
  }

  async totalRejeitados(): Promise<number> {
    const db = await this.abrir();
    return pedido(db.transaction("rejeitados", "readonly").objectStore("rejeitados").count());
  }

  /** Últimos rejeitados (mais recentes primeiro), para diagnóstico. */
  async listarRejeitados(limite: number = 50): Promise<RegistroRejeitado[]> {
    const db = await this.abrir();
    const todos = (await pedido(
      db.transaction("rejeitados", "readonly").objectStore("rejeitados").index("por_rejeitado").getAll(),
    )) as RegistroRejeitado[];
    return todos.reverse().slice(0, limite);
  }

  async limparTudo(): Promise<void> {
    const db = await this.abrir();
    const tx = db.transaction(["fila", "rejeitados"], "readwrite");
    tx.objectStore("fila").clear();
    tx.objectStore("rejeitados").clear();
    await concluida(tx);
  }
}
