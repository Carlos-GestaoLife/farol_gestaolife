import { iguaisEmTempoConstante, lerSegredo } from "@/lib/segredos";
import { chaveSha256, processarEntrada, registrarEntradas } from "./entradas";
import { interpretarCorpoFramer } from "./framer";

// Lógica da rota POST /api/webhooks/framer?k={FRAMER_WEBHOOK_SECRET}, separada do Next para
// ser testada direto. Contrato na seção "API de ingestão" do CLAUDE.md do sistema-leads.

/** Limite do corpo (um formulário de LP tem poucos campos). */
export const MAX_CORPO_FRAMER = 256 * 1024;

export type RequisicaoFramer = {
  k: string | null;
  texto: string;
  contentType: string | null;
  userAgent: string | null;
  submissionId?: string | null;
};

export type RespostaFramer =
  | { status: 200; corpo: { ok: true; duplicado: boolean } }
  | { status: 401 | 413 | 503; corpo: { erro: string } };

/** Confere o segredo `k`. Sem segredo configurado: "sem_segredo". */
export function autenticarFramer(k: string | null): "ok" | "invalido" | "sem_segredo" {
  const segredo = lerSegredo("FRAMER_WEBHOOK_SECRET");
  if (!segredo) return "sem_segredo";
  if (!k || !iguaisEmTempoConstante(k, segredo)) return "invalido";
  return "ok";
}

/**
 * Recebe um envio do Framer: autentica, grava cru em `entradas_brutas` (chave = sha256 do
 * corpo interpretado, ou do texto cru) e processa na hora (é rápido; sem chamada externa).
 * Um erro no processamento não muda a resposta: a entrada fica `erro` para reprocessar.
 */
export async function receberWebhookFramer(req: RequisicaoFramer): Promise<RespostaFramer> {
  const auth = autenticarFramer(req.k);
  if (auth === "sem_segredo") {
    return {
      status: 503,
      corpo: { erro: "Webhook do Framer não configurado: defina FRAMER_WEBHOOK_SECRET" },
    };
  }
  if (auth === "invalido") return { status: 401, corpo: { erro: "Segredo inválido" } };
  if (Buffer.byteLength(req.texto, "utf8") > MAX_CORPO_FRAMER) {
    return { status: 413, corpo: { erro: "Corpo grande demais" } };
  }

  const interpretado = interpretarCorpoFramer(req.texto, req.contentType);
  // A chave NÃO inclui data nem cabeçalhos: o mesmo envio repetido cai na mesma chave.
  const chave = chaveSha256(interpretado.corpo);

  const [aceita] = (
    await registrarEntradas([
      {
        fonte: "framer",
        chaveIdempotencia: chave,
        payload: {
          interpretado: interpretado.interpretado,
          corpo: interpretado.corpo,
          cabecalhos: {
            "content-type": req.contentType,
            "user-agent": req.userAgent,
            "framer-webhook-submission-id": req.submissionId ?? null,
          },
          recebido_em: new Date().toISOString(),
        },
      },
    ])
  ).aceitas;

  // Reenvio de uma entrada já processada: sem efeito. De uma entrada em `erro`: nova tentativa.
  try {
    await processarEntrada(aceita.id);
  } catch (erro) {
    console.error(
      "Falha ao processar entrada do Framer:",
      erro instanceof Error ? erro.message : erro,
    );
  }

  return { status: 200, corpo: { ok: true, duplicado: aceita.duplicada } };
}
