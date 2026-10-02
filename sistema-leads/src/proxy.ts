import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Proteção RÁPIDA das rotas (Next 16: proxy.ts substitui o antigo middleware.ts).
// Aqui só conferimos se EXISTE o cookie de sessão do Better Auth, sem consultar o banco nem
// validar a assinatura. Serve apenas para evitar renderizar páginas para quem claramente não
// está logado. A verificação real (sessão válida e papel) acontece nos layouts e páginas,
// com exigirSessao() e exigirPapel() de src/lib/sessao.ts. Um cookie forjado passa por aqui,
// mas não passa por lá.

const ROTAS_PUBLICAS = ["/login", "/api/auth"];

function ehPublica(caminho: string): boolean {
  return ROTAS_PUBLICAS.some((rota) => caminho === rota || caminho.startsWith(`${rota}/`));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (ehPublica(pathname) || getSessionCookie(request)) {
    return NextResponse.next();
  }

  // Rotas internas de API sem sessão: 401 em JSON (redirecionar não faz sentido para fetch).
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // Tudo, exceto:
    // - api/ingest, api/webhooks e api/cron: têm autenticação própria (token de dispositivo,
    //   assinatura do webhook, CRON_SECRET), implementada nas etapas seguintes. Ficam fora do
    //   proxy para que nunca recebam um redirect para /login;
    // - arquivos estáticos e internos do Next (_next/static, _next/image, favicon e afins).
    "/((?!api/ingest|api/webhooks|api/cron|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
