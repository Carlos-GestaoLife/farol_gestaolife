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
            Próximos passos: núcleo de ingestão, extensão do WhatsApp, webhooks das LPs e da Meta,
            e as telas de Leads, Kanban e Painel.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
