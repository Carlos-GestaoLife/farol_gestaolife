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
  // Webhooks (Etapas 5 e 6): ficam opcionais aqui. As rotas leem estes segredos direto de
  // process.env (src/lib/segredos.ts) e respondem 503 com mensagem clara quando faltam.
  // App Secret do app da Meta: valida o header X-Hub-Signature-256 do webhook.
  META_APP_SECRET: z.string().min(1).optional(),
  // Token combinado com a Meta na verificação GET do webhook (hub.verify_token).
  META_VERIFY_TOKEN: z.string().min(1).optional(),
  // Token de acesso (longa duração) da página, para buscar o lead na Graph API.
  META_PAGE_ACCESS_TOKEN: z.string().min(1).optional(),
  // Segredo do webhook do Framer, enviado na query string (?k=).
  FRAMER_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Reprocessamento (Etapa 10): protege /api/cron/reprocessar (header Authorization: Bearer).
  // Usado pelo n8n (a cada 5 min) e pelo cron diário da Vercel (vercel.json), que manda o header
  // sozinho quando a variável existe no projeto. Sem ela a rota responde 503. Lida direto de
  // process.env em src/lib/segredos.ts. Gere com: openssl rand -hex 32.
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
