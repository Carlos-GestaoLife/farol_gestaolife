import type { Metadata } from "next";
import { EmConstrucao } from "@/components/app/em-construcao";
import { exigirSessao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Kanban | Sistema de Leads Gestão Life" };

export default async function PaginaKanban() {
  await exigirSessao();
  return <EmConstrucao titulo="Kanban" etapa={7} />;
}
