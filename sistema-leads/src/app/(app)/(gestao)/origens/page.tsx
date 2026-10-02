import type { Metadata } from "next";
import { EmConstrucao } from "@/components/app/em-construcao";
import { exigirPapel } from "@/lib/sessao";

export const metadata: Metadata = { title: "Origens | Sistema de Leads Gestão Life" };

export default async function PaginaOrigens() {
  await exigirPapel("gestao");
  return <EmConstrucao titulo="Origens" etapa={8} />;
}
