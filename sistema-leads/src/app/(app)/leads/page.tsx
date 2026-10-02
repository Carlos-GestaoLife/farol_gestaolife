import type { Metadata } from "next";
import { EmConstrucao } from "@/components/app/em-construcao";
import { exigirSessao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Leads | Sistema de Leads Gestão Life" };

export default async function PaginaLeads() {
  await exigirSessao();
  return <EmConstrucao titulo="Leads" etapa={7} />;
}
