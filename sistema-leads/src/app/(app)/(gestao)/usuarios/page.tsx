import type { Metadata } from "next";
import { EmConstrucao } from "@/components/app/em-construcao";
import { exigirPapel } from "@/lib/sessao";

export const metadata: Metadata = { title: "Usuários e números | Sistema de Leads Gestão Life" };

export default async function PaginaUsuarios() {
  await exigirPapel("gestao");
  return <EmConstrucao titulo="Usuários e números" etapa={4} />;
}
