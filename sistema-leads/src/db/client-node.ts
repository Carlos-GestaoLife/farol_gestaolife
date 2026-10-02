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

  // Migração e seed preferem a conexão direta, sem pooler. No Neon o pooler (PgBouncer em
  // modo transação) não é indicado para DDL nem para a transação longa da migração; por isso
  // a integração Neon da Vercel cria também DATABASE_URL_UNPOOLED. Se ela não existir (ou
  // estiver vazia), usamos DATABASE_URL. A URL escolhida passa pela mesma validação de
  // formato (postgres:// ou postgresql://) do `parseEnv`.
  const semPooler = process.env.DATABASE_URL_UNPOOLED;
  const urlEscolhida = semPooler ? semPooler : process.env.DATABASE_URL;
  const { DATABASE_URL } = parseEnv({ ...process.env, DATABASE_URL: urlEscolhida });

  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const db = drizzle({ client: pool, schema });
  return { db, pool };
}
