import { BotaoSair } from "@/components/app/botao-sair";
import { MenuLateral, MenuTopo } from "@/components/app/navegacao";
import { Separator } from "@/components/ui/separator";
import { ROTULO_PAPEL } from "@/lib/papeis";
import { exigirSessao } from "@/lib/sessao";

// Shell das telas internas. Toda rota deste grupo exige sessão válida (verificada no servidor).
// Cada página também chama exigirSessao() (ou exigirPapel): o layout não reexecuta em toda
// navegação e não impede a página de rodar (renderização parcial do Next).
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const { user, papel } = await exigirSessao();
  const rotuloPapel = ROTULO_PAPEL[papel];
  const inicial = (user.name?.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      {/* Telas pequenas: barra no topo com menu suspenso. */}
      <header className="bg-sidebar flex items-center justify-between border-b px-4 py-2 md:hidden">
        <span className="text-sm font-semibold">Sistema de Leads Gestão Life</span>
        <MenuTopo papel={papel} nome={user.name} rotuloPapel={rotuloPapel} />
      </header>

      {/* Telas médias e grandes: barra lateral. */}
      <aside className="bg-sidebar text-sidebar-foreground hidden w-64 shrink-0 flex-col border-r md:flex">
        <div className="px-4 py-5">
          <p className="text-sm leading-tight font-semibold">Sistema de Leads</p>
          <p className="text-muted-foreground text-xs">Gestão Life</p>
        </div>
        <Separator />
        <div className="flex-1 overflow-y-auto p-3">
          <MenuLateral papel={papel} />
        </div>
        <Separator />
        {/* Rodapé: avatar, nome e papel numa linha; o botão Sair embaixo, sem sobreposição. */}
        <div className="grid gap-3 p-4" data-testid="rodape-menu">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="bg-sidebar-primary text-sidebar-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            >
              {inicial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="text-muted-foreground truncate text-xs">{rotuloPapel}</p>
            </div>
          </div>
          <BotaoSair className="w-full" />
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-8">
        {/* Telas largas (Kanban, Leads) marcam o conteúdo com data-largura="total". */}
        <div className="mx-auto w-full max-w-5xl has-[[data-largura=total]]:max-w-none">
          {children}
        </div>
      </main>
    </div>
  );
}
