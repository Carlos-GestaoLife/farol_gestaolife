import type { Metadata } from "next";
import { EmConstrucao } from "@/components/app/em-construcao";
import { exigirPapel } from "@/lib/sessao";

export const metadata: Metadata = { title: "Painel | Sistema de Leads Gestão Life" };

export default async function PaginaPainel() {
  await exigirPapel("gestao");
  return <EmConstrucao titulo="Painel" etapa={9} />;
}
