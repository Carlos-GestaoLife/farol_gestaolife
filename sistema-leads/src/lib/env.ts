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
  // Segredo do Better Auth para assinar sessões e cookies (gere com: openssl rand -base64 32).
  BETTER_AUTH_SECRET: z
    .string({ error: "BETTER_AUTH_SECRET não definida" })
    .min(32, "BETTER_AUTH_SECRET deve ter pelo menos 32 caracteres"),
  // URL pública do sistema (ex.: http://localhost:3000 ou https://farol-sistema-leads.vercel.app).
  BETTER_AUTH_URL: z.url({ error: "BETTER_AUTH_URL deve ser uma URL válida" }),
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

function semVazias(fonte: Record<string, string | undefined>) {
  // Variável vazia ("") conta como ausente, igual a não estar definida.
  return Object.fromEntries(
    Object.entries(fonte).filter(([, valor]) => valor !== undefined && valor !== ""),
  );
}

function formatarProblemas(erro: z.ZodError): string {
  const problemas = erro.issues
    .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  return `Variáveis de ambiente inválidas:\n${problemas}`;
}

/** Valida um objeto de variáveis. Lança erro com a lista de problemas se algo estiver inválido. */
export function parseEnv(fonte: Record<string, string | undefined>): Env {
  const resultado = envSchema.safeParse(semVazias(fonte));
  if (!resultado.success) {
    throw new Error(formatarProblemas(resultado.error));
  }
  return resultado.data;
}

/**
 * Valida só a DATABASE_URL. Usado pelos scripts de banco (migração, seed, criação do primeiro
 * usuário), que não precisam das variáveis do auth nem dos webhooks.
 */
export function parseDatabaseUrl(fonte: Record<string, string | undefined>): string {
  const resultado = envSchema.pick({ DATABASE_URL: true }).safeParse(semVazias(fonte));
  if (!resultado.success) {
    throw new Error(formatarProblemas(resultado.error));
  }
  return resultado.data.DATABASE_URL;
}

let cache: Env | undefined;

/** Retorna as variáveis validadas de `process.env`, com cache após a primeira leitura. */
export function getEnv(): Env {
  cache ??= parseEnv(process.env);
  return cache;
}
