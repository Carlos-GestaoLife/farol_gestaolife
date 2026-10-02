import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { criarClienteNode } from "./client-node";
import { account, user } from "./schema";

// Cria o primeiro usuário com papel `gestao` (o cadastro pelo site é fechado).
// Idempotente: sem as variáveis PRIMEIRO_GESTAO_* ou com o usuário já existente, não faz nada
// e sai com código 0. Roda no build de produção (scripts/build-vercel.mjs) e pode rodar à mão:
//   npm run db:criar-gestao
// A senha nunca é impressa. Ela é gravada com o mesmo hash do Better Auth (better-auth/crypto),
// numa conta `credential`, igual ao que o próprio Better Auth faria num cadastro.

// Lê .env.local; variáveis já definidas no ambiente têm prioridade.
config({ path: ".env.local", quiet: true });

const entradaSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "PRIMEIRO_GESTAO_EMAIL não é um e-mail válido" })),
  nome: z.string().trim().min(1, "PRIMEIRO_GESTAO_NOME está vazio"),
  senha: z.string().min(8, "PRIMEIRO_GESTAO_SENHA deve ter pelo menos 8 caracteres"),
});

async function main() {
  const email = process.env.PRIMEIRO_GESTAO_EMAIL;
  const nome = process.env.PRIMEIRO_GESTAO_NOME;
  const senha = process.env.PRIMEIRO_GESTAO_SENHA;

  if (!email || !nome || !senha) {
    console.log("Variáveis PRIMEIRO_GESTAO_* não definidas: criação do primeiro usuário pulada.");
    return;
  }

  const validacao = entradaSchema.safeParse({ email, nome, senha });
  if (!validacao.success) {
    const problemas = validacao.error.issues.map((issue) => `- ${issue.message}`).join("\n");
    throw new Error(`Variáveis PRIMEIRO_GESTAO_* inválidas:\n${problemas}`);
  }
  const dados = validacao.data;

  const { db, pool } = criarClienteNode();
  try {
    const existente = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, dados.email))
      .limit(1);
    if (existente.length > 0) {
      console.log("Usuário já existe, nada a fazer.");
      return;
    }

    const senhaHash = await hashPassword(dados.senha);
    const userId = randomUUID();
    const agora = new Date();

    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name: dados.nome,
        email: dados.email,
        emailVerified: true,
        papel: "gestao",
        createdAt: agora,
        updatedAt: agora,
      });
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: senhaHash,
        createdAt: agora,
        updatedAt: agora,
      });
    });

    console.log(`Usuário gestao criado: ${dados.email}`);
  } finally {
    await pool.end();
  }
}

main().catch((erro) => {
  console.error("Falha ao criar o primeiro usuário gestao:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
