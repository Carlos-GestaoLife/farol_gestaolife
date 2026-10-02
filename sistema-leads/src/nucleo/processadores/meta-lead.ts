import { z } from "zod";
import type { Tx } from "@/db";
import { atribuirOrigem } from "../atribuicao";
import { registrarDataContato } from "../contato";
import { definirEstagioInicialSeVazio } from "../estagios";
import { inserirEventoSeNaoExiste } from "../eventos";
import { montarIdentificadores, resolverPessoa } from "../identidade";
import { buscarLeadNaGraph, dataMeta, extrairCamposMeta, type FetchFn } from "../meta";
import type { EntradaBruta, Processador } from "../registro";

// Processador da fonte `meta_lead`: um lead de formulário da Meta (POST /api/webhooks/meta).
// A notificação só traz ids; os dados do lead vêm da Graph API. Falha na Graph API lança erro:
// a transação é desfeita, a entrada fica `erro` e o reprocessamento tenta de novo.
//
// A chamada à Graph API acontece dentro da transação do processamento (com timeout de 10 s).
// É uma leitura idempotente e o volume é baixo; se isso virar gargalo, mover a busca para
// antes da transação.

export const payloadMetaLeadSchema = z.object({
  leadgen_id: z.string().regex(/^\d{1,30}$/),
  form_id: z.string().nullish(),
  ad_id: z.string().nullish(),
  page_id: z.string().nullish(),
  created_time: z.union([z.number(), z.string()]).nullish(),
  change: z.unknown().optional(),
  entry_id: z.string().nullish(),
});

/** Cria o processador com um `fetch` injetável (testes usam um falso). */
export function criarProcessadorMetaLead(fetchFn?: FetchFn): Processador {
  return async (tx: Tx, entrada: EntradaBruta) => {
    const validacao = payloadMetaLeadSchema.safeParse(entrada.payload);
    if (!validacao.success) {
      throw new Error(
        "Notificação da Meta sem leadgen_id legível: veja o payload cru da entrada " +
          "(campo bruto) e ajuste interpretarNotificacaoMeta se o formato mudou",
      );
    }
    const p = validacao.data;
    const lead = await buscarLeadNaGraph(p.leadgen_id, fetchFn);
    const { campos, outros } = extrairCamposMeta(lead.field_data);

    const lista = montarIdentificadores({
      telefone: campos.telefone,
      email: campos.email,
      metaLeadId: p.leadgen_id,
    });
    if (lista.length === 0) {
      throw new Error(`Lead da Meta ${p.leadgen_id} sem identificador válido`);
    }

    const { pessoaId } = await resolverPessoa(tx, lista, {
      nomeExibicao: campos.nome,
      entradaBrutaId: entrada.id,
    });
    await definirEstagioInicialSeVazio(tx, pessoaId);

    const ids = {
      formId: lead.form_id ?? p.form_id ?? null,
      adId: lead.ad_id ?? p.ad_id ?? null,
      adsetId: lead.adset_id ?? null,
      campaignId: lead.campaign_id ?? null,
    };
    const ocorridoEm =
      dataMeta(lead.created_time) ?? dataMeta(p.created_time) ?? entrada.recebidoEm;

    const origemId = await atribuirOrigem(tx, {
      canal: "meta_form",
      metaFormId: ids.formId,
      metaAdId: ids.adId,
      metaAdsetId: ids.adsetId,
      metaCampaignId: ids.campaignId,
    });

    await inserirEventoSeNaoExiste(tx, {
      pessoaId,
      tipo: "form_enviado",
      ocorridoEm,
      canal: "meta_form",
      origemId,
      entradaBrutaId: entrada.id,
      dados: {
        leadgen_id: p.leadgen_id,
        form_id: ids.formId,
        ad_id: ids.adId,
        adset_id: ids.adsetId,
        campaign_id: ids.campaignId,
        page_id: p.page_id ?? null,
        campos,
        outros,
      },
    });

    await registrarDataContato(tx, pessoaId, ocorridoEm);
  };
}

/** Processador padrão (fetch global). */
export const processarMetaLead = criarProcessadorMetaLead();
