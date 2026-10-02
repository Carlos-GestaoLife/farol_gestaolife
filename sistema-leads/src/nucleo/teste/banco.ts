import { config } from "dotenv";
import { TransactionRollbackError } from "drizzle-orm";
import { db, ehBancoLocal, type Tx } from "@/db";

// Apoio aos testes de integração contra um Postgres de teste.
// Usa DATABASE_URL_TESTE; sem ela, a DATABASE_URL do .env.local, mas SÓ se o host for
// localhost (nunca roda teste contra o Neon por engano). Sem banco, os testes são pulados.

config({ path: ".env.local", quiet: true });

function urlDeTeste(): string | undefined {
  const explicita = process.env.DATABASE_URL_TESTE;
  if (explicita) return explicita;
  const padrao = process.env.DATABASE_URL;
  return padrao && ehBancoLocal(padrao) ? padrao : undefined;
}

const url = urlDeTeste();

if (url) {
  // O `db` é criado na primeira consulta e lê estas variáveis via getEnv().
  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ||= "segredo-de-teste-com-pelo-menos-32-caracteres";
  process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
}

export const temBanco = Boolean(url);

/** Roda `fn` numa transação que é sempre desfeita no fim (não deixa lixo no banco). */
export async function emTransacaoDesfeita(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      tx.rollback();
    });
  } catch (erro) {
    if (!(erro instanceof TransactionRollbackError)) throw erro;
  }
}

/** Celular brasileiro aleatório: canônico (13 dígitos) e o formato antigo sem o nono dígito. */
export function celularAleatorio(): { canonico: string; semNono: string } {
  const local = "9" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  return { canonico: "55629" + local, semNono: "5562" + local };
}

export function emailAleatorio(): string {
  return `teste-${crypto.randomUUID()}@exemplo.com.br`;
}
