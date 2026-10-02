import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Carrega .env.local (mesmo arquivo usado pelo Next em desenvolvimento).
// `drizzle-kit generate` não precisa de banco, por isso a URL pode faltar sem erro.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
