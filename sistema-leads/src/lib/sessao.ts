import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth, type Sessao } from "@/lib/auth";
import { papelDe, type Papel } from "@/lib/papeis";

export type SessaoComPapel = Sessao & { papel: Papel };

/**
 * Sessão atual lida no servidor (Better Auth, com o cookie assinado ou o banco).
 * O papel vem sempre daqui, nunca de um cookie ou parâmetro enviado pelo navegador.
 * `cache` evita ler a sessão mais de uma vez na mesma renderização (layout + página).
 */
export const obterSessao = cache(async (): Promise<SessaoComPapel | null> => {
  // headers() primeiro: marca a rota como dinâmica antes de tocar no auth (que lê as variáveis
  // de ambiente), para o `next build` não tentar pré-renderizar a página sem elas.
  const cabecalhos = await headers();
  const sessao = await auth.api.getSession({ headers: cabecalhos });
  if (!sessao) return null;
  return { ...sessao, papel: papelDe(sessao.user.papel) };
});

/** Exige sessão; sem sessão, redireciona para /login. */
export async function exigirSessao(): Promise<SessaoComPapel> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  return sessao;
}

/** Exige sessão com o papel informado; com outro papel, volta para o início com aviso. */
export async function exigirPapel(papel: Papel): Promise<SessaoComPapel> {
  const sessao = await exigirSessao();
  if (sessao.papel !== papel) redirect("/?erro=sem-permissao");
  return sessao;
}
