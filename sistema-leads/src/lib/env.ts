import { z } from "zod";

/**
 * Variáveis de ambiente do sistema, validadas com zod.
 *
 * A leitura é preguiçosa (só acontece na primeira chamada de `getEnv()`), para que o
 * `next build` funcione mesmo sem as variáveis definidas no ambiente de build.
 */
export const envSchema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL não definida" })
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL deve começar com postgres:// ou postgresql://"),
  // Obrigatória a partir da Etapa 2 (auth).
  BETTER_AUTH_SECRET: z.string().min(1).optional(),
  // Obrigatória a partir da Etapa 2 (auth).
  BETTER_AUTH_URL: z.url().optional(),
  // Obrigatória a partir da Etapa 6 (webhook da Meta).
  META_APP_SECRET: z.string().min(1).optional(),
  // Obrigatória a partir da Etapa 6 (webhook da Meta).
  META_VERIFY_TOKEN: z.string().min(1).optional(),
  // Obrigatória a partir da Etapa 6 (webhook da Meta).
  META_PAGE_ACCESS_TOKEN: z.string().min(1).optional(),
  // Obrigatória a partir da Etapa 5 (webhook do Framer).
  FRAMER_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Obrigatória a partir da Etapa 10 (reprocessamento).
  CRON_SECRET: z.string().min(1).optional(),
  // Obrigatória a partir da Fase 2 (webhook da Hotmart).
  HOTMART_HOTTOK: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Valida um objeto de variáveis. Lança erro com a lista de problemas se algo estiver inválido. */
export function parseEnv(fonte: Record<string, string | undefined>): Env {
  // Variável vazia ("") conta como ausente, igual a não estar definida.
  const limpo = Object.fromEntries(
    Object.entries(fonte).filter(([, valor]) => valor !== undefined && valor !== ""),
  );
  const resultado = envSchema.safeParse(limpo);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${problemas}`);
  }
  return resultado.data;
}

let cache: Env | undefined;

/** Retorna as variáveis validadas de `process.env`, com cache após a primeira leitura. */
export function getEnv(): Env {
  cache ??= parseEnv(process.env);
  return cache;
}
