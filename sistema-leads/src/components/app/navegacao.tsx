"use client";

import {
  Activity,
  ChartColumn,
  House,
  Menu,
  Signpost,
  SquareKanban,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { podeAcessar, type Papel } from "@/lib/papeis";
import { cn } from "@/lib/utils";

type ItemMenu = { href: string; rotulo: string; icone: LucideIcon };

const ITENS: ItemMenu[] = [
  { href: "/", rotulo: "Início", icone: House },
  { href: "/kanban", rotulo: "Kanban", icone: SquareKanban },
  { href: "/leads", rotulo: "Leads", icone: Users },
  { href: "/origens", rotulo: "Origens", icone: Signpost },
  { href: "/painel", rotulo: "Painel", icone: ChartColumn },
  { href: "/saude", rotulo: "Saúde", icone: Activity },
  { href: "/usuarios", rotulo: "Usuários e números", icone: UserCog },
];

// O menu só esconde o que o papel não acessa; quem bloqueia de verdade é o servidor
// (exigirPapel no layout do grupo (gestao)).
function itensDoPapel(papel: Papel) {
  return ITENS.filter((item) => podeAcessar(papel, item.href));
}

function estaAtivo(caminhoAtual: string, href: string) {
  if (href === "/") return caminhoAtual === "/";
  return caminhoAtual === href || caminhoAtual.startsWith(`${href}/`);
}

/** Menu da barra lateral (telas médias e grandes). */
export function MenuLateral({ papel }: { papel: Papel }) {
  const caminho = usePathname();
  return (
    <nav className="grid gap-1" aria-label="Menu principal">
      {itensDoPapel(papel).map(({ href, rotulo, icone: Icone }) => (
        <Link
          key={href}
          href={href}
          aria-current={estaAtivo(caminho, href) ? "page" : undefined}
          className={cn(
            "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
            estaAtivo(caminho, href) &&
              "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
          )}
        >
          <Icone className="size-4" />
          {rotulo}
        </Link>
      ))}
    </nav>
  );
}

/** Menu suspenso do topo (telas pequenas), com o usuário e o botão Sair. */
export function MenuTopo({
  papel,
  nome,
  rotuloPapel,
}: {
  papel: Papel;
  nome: string;
  rotuloPapel: string;
}) {
  const router = useRouter();

  async function sair() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Abrir menu">
          <Menu />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate">{nome}</span>
          <span className="text-muted-foreground block text-xs font-normal">{rotuloPapel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {itensDoPapel(papel).map(({ href, rotulo, icone: Icone }) => (
          <DropdownMenuItem key={href} asChild>
            <Link href={href}>
              <Icone />
              {rotulo}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={sair}>Sair</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
