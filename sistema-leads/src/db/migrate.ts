import { migrate } from "drizzle-orm/node-postgres/migrator";
import { criarClienteNode } from "./client-node";

// Aplica as migrações versionadas em src/db/migrations.
// Este script roda fora do runtime da Vercel, por isso usa o driver `pg` (node-postgres)
// e não o neon-http: o neon-http não suporta de forma confiável a transação da migração.

async function main() {
  const { db, pool } = criarClienteNode();
  try {
    console.log("Aplicando migrações...");
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
    console.log("Migrações aplicadas com sucesso.");
  } finally {
    await pool.end();
  }
}

main().catch((erro) => {
  console.error("Falha ao aplicar migrações:", erro);
  process.exit(1);
});
