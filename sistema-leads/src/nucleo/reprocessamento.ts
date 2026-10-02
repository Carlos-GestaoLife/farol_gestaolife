import { iguaisEmTempoConstante, lerSegredo } from "@/lib/segredos";
import { processarPendentes } from "./entradas";

// Reprocessamento (Etapa 10): lógica da rota GET e POST /api/cron/reprocessar, separada do Next
// para ser testada direto. Chamada pelo n8n a cada 5 minutos e pelo cron da Vercel uma vez por
// dia (fallback), sempre com `Authorization: Bearer {CRON_SECRET}`. A Vercel Cron manda esse
// header sozinha quando a variável CRON_SECRET existe no projeto.

export const LIMITE_REPROCESSAMENTO = 100;
export const MAX_TENTATIVAS = 10;

/** Confere o header Authorization. Sem CRON_SECRET configurado: "sem_segredo". */
export function autenticarCron(authorization: string | null): "ok" | "invalido" | "sem_segredo" {
  const segredo = lerSegredo("CRON_SECRET");
  if (!segredo) return "sem_segredo";
  const m = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? "");
  if (!m || !iguaisEmTempoConstante(m[1].trim(), segredo)) return "invalido";
  return "ok";
}

export type RespostaReprocessamento =
  | {
      status: 200;
      corpo: { ok: true; total: number; processadas: number; erros: number; duracao_ms: number };
    }
  | { status: 401 | 503; corpo: { erro: string } };

/**
 * Autentica e reprocessa as entradas `pendente` e `erro` com menos de 10 tentativas (até 100
 * por chamada, das mais antigas para as mais novas). Devolve o resumo.
 */
export async function executarReprocessamento(
  authorization: string | null,
): Promise<RespostaReprocessamento> {
  const auth = autenticarCron(authorization);
  if (auth === "sem_segredo") {
    return { status: 503, corpo: { erro: "Reprocessamento não configurado: defina CRON_SECRET" } };
  }
  if (auth === "invalido") return { status: 401, corpo: { erro: "Não autorizado" } };

  const inicio = Date.now();
  const r = await processarPendentes({ limite: LIMITE_REPROCESSAMENTO, maxTentativas: MAX_TENTATIVAS });
  const duracao = Date.now() - inicio;
  if (r.total > 0) {
    console.info(
      `Reprocessamento: ${r.total} entradas, ${r.processadas} processadas, ${r.erros} com erro (${duracao} ms)`,
    );
  }
  return {
    status: 200,
    corpo: { ok: true, total: r.total, processadas: r.processadas, erros: r.erros, duracao_ms: duracao },
  };
}
