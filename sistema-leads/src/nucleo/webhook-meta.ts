import { iguaisEmTempoConstante, lerSegredo } from "@/lib/segredos";
import { chaveSha256, processarEntrada, registrarEntradas, type ItemEntrada } from "./entradas";
import { assinaturaMetaValida, interpretarNotificacaoMeta } from "./meta";

// Lógica das rotas GET e POST /api/webhooks/meta, separada do Next para ser testada direto.
// Contrato na seção "API de ingestão" do CLAUDE.md do sistema-leads.

/** Limite do corpo de uma notificação (a Meta agrupa no máximo algumas centenas de mudanças). */
export const MAX_CORPO_META = 1024 * 1024;

export type RespostaVerificacao = { status: 200 | 403 | 503; texto: string };

/**
 * Verificação do webhook (GET): `hub.mode=subscribe` e `hub.verify_token` igual a
 * META_VERIFY_TOKEN devolvem o `hub.challenge` em texto puro.
 */
export function verificarWebhookMeta(params: URLSearchParams): RespostaVerificacao {
  const esperado = lerSegredo("META_VERIFY_TOKEN");
  if (!esperado) {
    return { status: 503, texto: "Webhook da Meta não configurado: defina META_VERIFY_TOKEN" };
  }
  const modo = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const desafio = params.get("hub.challenge");
  if (modo !== "subscribe" || !token || desafio === null || !iguaisEmTempoConstante(token, esperado)) {
    return { status: 403, texto: "Verificação recusada" };
  }
  return { status: 200, texto: desafio };
}

export type RespostaNotificacao =
  | { status: 200; corpo: { ok: true; recebidos: number; duplicados: number }; idsParaProcessar: string[] }
  | { status: 401 | 413 | 503; corpo: { erro: string }; idsParaProcessar: [] };

/**
 * Notificação (POST): valida a assinatura e grava cada `leadgen_id` em `entradas_brutas`
 * (fonte `meta_lead`, chave = leadgen_id). NÃO processa: a rota processa depois de responder
 * (a Meta exige resposta em poucos segundos). Devolve os ids das entradas a processar.
 *
 * Assinatura inválida ou ausente: 401 e nada é gravado (não é uma entrada legítima).
 * Assinatura válida mas corpo ilegível: gravado cru (regra "nada se perde") e vai para `erro`.
 */
export async function receberWebhookMeta(req: {
  texto: string;
  assinatura: string | null;
}): Promise<RespostaNotificacao> {
  const segredo = lerSegredo("META_APP_SECRET");
  if (!segredo) {
    return {
      status: 503,
      corpo: { erro: "Webhook da Meta não configurado: defina META_APP_SECRET" },
      idsParaProcessar: [],
    };
  }
  if (Buffer.byteLength(req.texto, "utf8") > MAX_CORPO_META) {
    return { status: 413, corpo: { erro: "Corpo grande demais" }, idsParaProcessar: [] };
  }
  if (!assinaturaMetaValida(req.texto, req.assinatura, segredo)) {
    console.warn(
      `Webhook da Meta com assinatura ${req.assinatura ? "inválida" : "ausente"}: recusado (401)`,
    );
    return { status: 401, corpo: { erro: "Assinatura inválida" }, idsParaProcessar: [] };
  }

  const notificacao = interpretarNotificacaoMeta(req.texto);
  let itens: ItemEntrada[];
  if (notificacao.ok) {
    itens = notificacao.leads.map((lead) => ({
      fonte: "meta_lead" as const,
      chaveIdempotencia: lead.leadgen_id,
      payload: lead,
    }));
  } else {
    // Assinada pela Meta, mas num formato que não entendemos: guarda o texto cru.
    itens = [
      {
        fonte: "meta_lead",
        chaveIdempotencia: `ilegivel:${chaveSha256(req.texto)}`,
        payload: { bruto: req.texto, erro_interpretacao: notificacao.erro },
      },
    ];
  }

  // registrarEntradas aceita até 100 por chamada.
  const aceitas = [];
  for (let i = 0; i < itens.length; i += 100) {
    aceitas.push(...(await registrarEntradas(itens.slice(i, i + 100))).aceitas);
  }
  const ids = [...new Set(aceitas.map((a) => a.id))];
  return {
    status: 200,
    corpo: {
      ok: true,
      recebidos: aceitas.length,
      duplicados: aceitas.filter((a) => a.duplicada).length,
    },
    idsParaProcessar: ids,
  };
}

/** Processa as entradas, uma por vez. Erros ficam na entrada (status `erro`). */
export async function processarEntradasMeta(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await processarEntrada(id);
    } catch (erro) {
      console.error(
        "Falha ao processar lead da Meta:",
        erro instanceof Error ? erro.message : erro,
      );
    }
  }
}
