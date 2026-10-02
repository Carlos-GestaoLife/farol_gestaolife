import type { Metadata } from "next";
import { EmConstrucao } from "@/components/app/em-construcao";
import { exigirPapel } from "@/lib/sessao";

export const metadata: Metadata = { title: "Saúde | Sistema de Leads Gestão Life" };

export default async function PaginaSaude() {
  await exigirPapel("gestao");
  return <EmConstrucao titulo="Saúde" etapa={9} />;
}
