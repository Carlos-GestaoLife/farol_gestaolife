import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { getEnv } from "@/lib/env";

// Better Auth: e-mail e senha, cadastro fechado (só a gestão cria usuário) e papel no usuário.
// O banco é o mesmo `db` de src/db/index.ts (único acesso ao banco da aplicação).

function criarAuth() {
  const env = getEnv();
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      // Ninguém se cadastra sozinho: o endpoint /sign-up/email responde erro.
      disableSignUp: true,
      minPasswordLength: 8,
    },
    user: {
      additionalFields: {
        papel: {
          type: "string",
          required: false,
          defaultValue: "comercial",
          // O cliente nunca define o papel (nem no cadastro nem no update-user).
          input: false,
        },
      },
    },
    session: {
      // Cache da sessão num cookie assinado por 5 minutos: evita uma consulta ao banco a cada
      // requisição. Consequência: troca de papel ou bloqueio leva até 5 minutos para valer.
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    // nextCookies precisa ser o último plugin (grava os cookies em Server Actions).
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof criarAuth>;

let instancia: Auth | undefined;

function obterInstancia(): Auth {
  instancia ??= criarAuth();
  return instancia;
}

/**
 * Instância do Better Auth criada no primeiro uso (e não ao importar o módulo), igual ao `db`,
 * para que o `next build` não exija BETTER_AUTH_SECRET, BETTER_AUTH_URL nem DATABASE_URL.
 */
export const auth: Auth = new Proxy({} as Auth, {
  get(_alvo, propriedade) {
    const alvo = obterInstancia();
    const valor = Reflect.get(alvo, propriedade, alvo);
    return typeof valor === "function" ? valor.bind(alvo) : valor;
  },
  has(_alvo, propriedade) {
    return Reflect.has(obterInstancia(), propriedade);
  },
});

export type Sessao = Auth["$Infer"]["Session"];
export type Usuario = Sessao["user"];
