import type { Tx } from "@/db";

// Atribuição de origem (seção "Atribuição de origem" do CLAUDE.md do sistema-leads).
// Ponto ÚNICO de atribuição: os processadores chamam só esta função.
//
// Etapas 4 a 6: ainda não há atribuição; a função devolve null e os eventos ficam com
// `origem_id` nulo. Os processadores já passam todo o contexto necessário. Na Etapa 8:
// - WhatsApp: 1) `ctwa` com o id do anúncio (origem pelo meta_ad_id, ou origem automática);
//   2) `texto_abertura` casando com `origens.padrao_texto`; 3) "WhatsApp direto (desconhecida)".
// - Formulário Meta: por `meta_form_id` e `meta_ad_id`.
// - LP Framer: pelo campo oculto `origem` (código) e pelas UTMs.

export type UtmsAtribuicao = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
};

export type ContextoAtribuicao =
  | {
      canal: "whatsapp";
      numeroMonitorado: string;
      textoAbertura: string | null;
      ctwa: Record<string, unknown> | null;
    }
  | {
      canal: "lp_form";
      utm: UtmsAtribuicao;
      /** Campo oculto `origem` da LP (código da origem cadastrada). */
      origemCodigo?: string | null;
      fbclid?: string | null;
    }
  | {
      canal: "meta_form";
      metaFormId?: string | null;
      metaAdId?: string | null;
      metaAdsetId?: string | null;
      metaCampaignId?: string | null;
    };

/** Id da origem atribuída ao contexto, ou null quando não há atribuição (hoje, sempre). */
export async function atribuirOrigem(tx: Tx, contexto: ContextoAtribuicao): Promise<string | null> {
  void tx;
  void contexto;
  return null;
}
