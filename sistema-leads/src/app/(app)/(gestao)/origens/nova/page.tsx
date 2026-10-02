import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirPapel } from "@/lib/sessao";
import { FormularioOrigem } from "../componentes";

export const metadata: Metadata = { title: "Nova origem | Sistema de Leads Gestão Life" };

export default async function PaginaNovaOrigem() {
  await exigirPapel("gestao");
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href="/origens"
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          Voltar para Origens
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Nova origem</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dados da origem</CardTitle>
          <CardDescription>
            Depois de criar, a página da origem gera o link do WhatsApp e o QR Code com o texto
            pré-preenchido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioOrigem />
        </CardContent>
      </Card>
    </div>
  );
}
