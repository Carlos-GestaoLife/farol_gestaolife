// Papéis de acesso do sistema. Função pura, sem dependência de Next ou do banco, para poder
// ser usada no servidor, no cliente (montar o menu) e nos testes.

export const PAPEIS = ["gestao", "comercial"] as const;

export type Papel = (typeof PAPEIS)[number];

export const ROTULO_PAPEL: Record<Papel, string> = {
  gestao: "Gestão",
  comercial: "Comercial",
};

/**
 * Prefixos de rota exclusivos da gestão. Tudo o que não está aqui (/, /kanban, /leads,
 * /pessoas...) é acessível a qualquer usuário com sessão.
 */
export const PREFIXOS_SO_GESTAO = [
  "/origens",
  "/painel",
  "/saude",
  "/usuarios",
  "/dispositivos",
] as const;

/** Converte um valor qualquer (vindo da sessão) em papel. Valor desconhecido vira `comercial`, o de menor acesso. */
export function papelDe(valor: unknown): Papel {
  return valor === "gestao" ? "gestao" : "comercial";
}

function casaPrefixo(rota: string, prefixo: string): boolean {
  return rota === prefixo || rota.startsWith(`${prefixo}/`);
}

/** Diz se o papel pode acessar a rota (caminho, sem query string). */
export function podeAcessar(papel: Papel, rota: string): boolean {
  if (papel === "gestao") return true;
  const caminho = rota.split(/[?#]/)[0] || "/";
  return !PREFIXOS_SO_GESTAO.some((prefixo) => casaPrefixo(caminho, prefixo));
}
