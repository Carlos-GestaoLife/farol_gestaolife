import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

// ÚNICO ponto de acesso ao banco da aplicação. Hoje: Neon via HTTP (serverless na Vercel).
// Para migrar para o Postgres da VPS, troque só este arquivo:
//   import { Pool } from "pg"; import { drizzle } from "drizzle-orm/node-postgres";
//   const pool = new Pool({ connectionString: getEnv().DATABASE_URL });
//   return drizzle({ client: pool, schema });

function criarDbNeon(url: string) {
  return drizzleNeon({ client: neon(url), schema });
}

export type Db = ReturnType<typeof criarDbNeon>;

/** Postgres local de desenvolvimento (localhost), que não fala o protocolo HTTP do Neon. */
function ehBancoLocal(url: string): boolean {
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
    // Só em desenvolvimento local: o driver neon-http precisa de um endpoint HTTP do Neon,
    // então para um Postgres em localhost usamos o node-postgres. A API de consultas do
    // Drizzle é a mesma; o tipo exposto continua o do neon-http (sem transações interativas),
    // para que nenhum código da aplicação dependa de algo que não funcione na Vercel.
    const pool = new Pool({ connectionString: url, max: 5 });
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
