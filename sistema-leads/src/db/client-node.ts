import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { parseEnv } from "../lib/env";
import * as schema from "./schema";

/**
 * Cliente Drizzle com driver `pg` para scripts que rodam fora do runtime da Vercel
 * (migração e seed). Funciona tanto no Neon quanto num Postgres local ou na VPS.
 * A aplicação NÃO usa este arquivo: ela usa `src/db/index.ts`.
 */
export function criarClienteNode() {
  // Lê .env.local; variáveis já definidas no ambiente têm prioridade.
  config({ path: ".env.local", quiet: true });
  const { DATABASE_URL } = parseEnv(process.env);
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const db = drizzle({ client: pool, schema });
  return { db, pool };
}
