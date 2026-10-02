import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirSessao } from "@/lib/sessao";

export default async function PaginaInicial({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string | string[] }>;
}) {
  const { user } = await exigirSessao();
  const { erro } = await searchParams;

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{`Bem-vindo, ${user.name}`}</h1>

      {erro === "sem-permissao" ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-4 py-3 text-sm"
        >
          Você não tem permissão para acessar aquela tela. Ela é exclusiva da gestão.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>O que já funciona</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground grid gap-2 text-sm">
          <p>Banco de dados com o schema completo, estágios iniciais e a origem desconhecida.</p>
          <p>
            Login com e-mail e senha, papéis Gestão e Comercial e proteção de todas as telas
            internas.
          </p>
          <p>
            Núcleo de ingestão (entradas idempotentes e resolução de identidade) e ingestão do
            WhatsApp pelo piolho, com dispositivos, usuários e números monitorados.
          </p>
          <p>Webhooks das LPs (Framer) e dos formulários da Meta.</p>
          <p>
            Telas de Leads (busca, filtros e novo lead), Kanban (arrastar entre estágios) e
            Pessoa (linha do tempo, notas, estágio e responsável).
          </p>
          <p>Próximos passos: origens e atribuição, Painel e Saúde.</p>
        </CardContent>
      </Card>
    </div>
  );
}
