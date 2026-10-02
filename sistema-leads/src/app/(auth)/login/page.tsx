import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { destinoSeguro } from "@/lib/redirecionamento";
import { obterSessao } from "@/lib/sessao";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = {
  title: "Entrar | Sistema de Leads Gestão Life",
};

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  // Quem já está logado não precisa ver o login.
  if (await obterSessao()) redirect("/");

  const { next } = await searchParams;

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Sistema de Leads Gestão Life</CardTitle>
        <CardDescription>Entre com seu e-mail e senha.</CardDescription>
      </CardHeader>
      <CardContent>
        <FormularioLogin destino={destinoSeguro(next)} />
      </CardContent>
    </Card>
  );
}
