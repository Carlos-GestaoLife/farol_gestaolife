import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

// ÚNICO ponto de acesso ao banco da aplicação. Hoje: Neon via HTTP (serverless na Vercel).
// Para migrar para o Postgres da VPS, troque só este arquivo:
//   import { Pool } from "pg"; import { drizzle } from "drizzle-orm/node-postgres";
//   const pool = new Pool({ connectionString: getEnv().DATABASE_URL });
//   return drizzle({ client: pool, schema });

function criarDb() {
  const sql = neon(getEnv().DATABASE_URL);
  return drizzle({ client: sql, schema });
}

export type Db = ReturnType<typeof criarDb>;

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
