import { Pool as PoolNeon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { Pool as PoolPg } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

// ÚNICO ponto de acesso ao banco da aplicação (e o único lugar onde se troca o driver).
//
// Hoje: Neon via WebSocket (`drizzle-orm/neon-serverless` com o `Pool` de
// `@neondatabase/serverless`). Escolhemos este driver, e não o `neon-http`, porque a resolução
// de identidade e o processamento de uma entrada precisam de transação interativa
// (ler, decidir e gravar dentro do mesmo `db.transaction`). O `neon-http` não suporta isso.
// O WebSocket usado é o global do Node 22+ (o `@neondatabase/serverless` cai nele quando
// `neonConfig.webSocketConstructor` não está definido); por isso não dependemos do pacote `ws`.
//
// Para migrar para o Postgres da VPS, troque só este arquivo:
//   import { Pool } from "pg"; import { drizzle } from "drizzle-orm/node-postgres";
//   const pool = new Pool({ connectionString: getEnv().DATABASE_URL });
//   return drizzle({ client: pool, schema });

function criarDbNeon(url: string) {
  const pool = new PoolNeon({ connectionString: url });
  // Conexão ociosa derrubada pelo servidor não pode derrubar o processo.
  pool.on("error", (erro: Error) => console.error("Erro no pool do Neon:", erro.message));
  return drizzleNeon({ client: pool, schema });
}

export type Db = ReturnType<typeof criarDbNeon>;

/** Transação recebida no callback de `db.transaction`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Qualquer executor de consultas: o `db` ou uma transação aberta. */
export type Executor = Db | Tx;

/** Postgres local de desenvolvimento e testes (localhost), que não fala o protocolo do Neon. */
export function ehBancoLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

function criarDb(): Db {
  const url = getEnv().DATABASE_URL;
  if (ehBancoLocal(url)) {
    // Só em desenvolvimento e testes locais: o Postgres em localhost não tem o proxy WebSocket
    // do Neon, então usamos o node-postgres. A API do Drizzle é a mesma (inclusive
    // `db.transaction`), e o tipo exposto continua o do neon-serverless.
    const pool = new PoolPg({ connectionString: url, max: 5 });
    pool.on("error", (erro) => console.error("Erro no pool do Postgres local:", erro.message));
    return drizzleNodePg({ client: pool, schema }) as unknown as Db;
  }
  return criarDbNeon(url);
}

let instancia: Db | undefined;

/**
 * Instância do Drizzle criada na primeira utilização (e não ao importar o módulo),
 * para que o `next build` não exija DATABASE_URL.
 */
export const db: Db = new Proxy({} as Db, {
  get(_alvo, propriedade) {
    instancia ??= criarDb();
    const valor = Reflect.get(instancia, propriedade, instancia);
    return typeof valor === "function" ? valor.bind(instancia) : valor;
  },
});
