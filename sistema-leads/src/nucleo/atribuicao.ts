import type { Tx } from "@/db";

// Atribuição de origem (seção "Atribuição de origem" do CLAUDE.md do sistema-leads).
// Ponto ÚNICO de atribuição: os processadores chamam só esta função.
//
// Etapa 4: ainda não há atribuição; a função devolve null e o evento `conversa_iniciada`
// fica com `origem_id` nulo. Na Etapa 8 ela passa a seguir a ordem do CLAUDE.md:
// 1) `ctwa` com o id do anúncio (origem pelo meta_ad_id, ou origem automática);
// 2) `texto_abertura` casando com `origens.padrao_texto`;
// 3) origem "WhatsApp direto (desconhecida)".

export type ContextoAtribuicao = {
  canal: "whatsapp";
  numeroMonitorado: string;
  textoAbertura: string | null;
  ctwa: Record<string, unknown> | null;
};

/** Id da origem atribuída ao contexto, ou null quando não há atribuição (hoje, sempre). */
export async function atribuirOrigem(tx: Tx, contexto: ContextoAtribuicao): Promise<string | null> {
  void tx;
  void contexto;
  return null;
}
