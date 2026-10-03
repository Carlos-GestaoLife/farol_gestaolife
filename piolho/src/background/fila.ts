// Fila local de mensagens a enviar ao servidor (dona: o service worker).
//
// Regra de ouro "nada se perde": toda mensagem entra aqui antes do envio e só sai quando o
// servidor devolver o wa_msg_id em `aceitos`. A chave é o wa_msg_id, então enfileirar de novo a
// mesma mensagem (escuta ao vivo e varredura) não duplica.
//
// TODO Etapa 3: implementação em IndexedDB (banco "piolho", store "fila", chave wa_msg_id, índice
// por enfileirada_em), envio em lotes de até 100 com reenvio e backoff exponencial (teto de 5 min).
import type { ItemMensagem } from "../shared/protocol";

export interface Fila {
  /** Grava os itens (idempotente por wa_msg_id). */
  enfileirar(itens: ItemMensagem[]): Promise<void>;
  /** Até `limite` itens mais antigos, sem removê-los. */
  proximoLote(limite: number): Promise<ItemMensagem[]>;
  /** Remove da fila só os wa_msg_id aceitos pelo servidor. */
  confirmarAceitos(waMsgIds: string[]): Promise<void>;
  /** Quantidade de itens pendentes (vai no heartbeat como fila_pendente). */
  tamanho(): Promise<number>;
}

function naoImplementado(): never {
  throw new Error("Fila não implementada (TODO Etapa 3).");
}

/** Esqueleto da fila em IndexedDB. TODO Etapa 3. */
export class FilaIndexedDb implements Fila {
  async enfileirar(_itens: ItemMensagem[]): Promise<void> {
    naoImplementado();
  }

  async proximoLote(_limite: number): Promise<ItemMensagem[]> {
    return naoImplementado();
  }

  async confirmarAceitos(_waMsgIds: string[]): Promise<void> {
    naoImplementado();
  }

  async tamanho(): Promise<number> {
    return naoImplementado();
  }
}
