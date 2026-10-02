import { and, asc, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db";
import { canalEvento, estagios, pessoas, tipoEvento } from "@/db/schema";
import { inserirEventoSeNaoExiste } from "./eventos";

// Estágios do kanban e movimentos automáticos (seção "Estágios iniciais" do CLAUDE.md).
// Movimento automático só vai PARA FRENTE (ordem maior que a atual) e nunca tira a pessoa
// de um estágio final (ganho ou perdido). Movimento manual (kanban) é outra função, na Etapa 7.

type TipoEvento = (typeof tipoEvento.enumValues)[number];
type CanalEvento = (typeof canalEvento.enumValues)[number];

export type ContextoMovimento = {
  canal: CanalEvento;
  ocorridoEm: Date;
  entradaBrutaId?: string | null;
  numeroMonitorado?: string | null;
};

export type ResultadoMovimento =
  | {
      movido: false;
      motivo: "sem_estagio_com_gatilho" | "pessoa_nao_encontrada" | "estagio_final" | "nao_avanca";
    }
  | { movido: true; de: string | null; para: string };

/**
 * Move a pessoa para o estágio cujo `gatilho_automatico` é `gatilho`, se isso for um avanço.
 * Pessoa sem estágio conta como ordem 0. Ao mover, atualiza `pessoas.estagio_id` e grava o
 * evento `estagio_alterado` (dados { de, para, automatico: true }, sem usuário).
 */
export async function moverEstagioAutomatico(
  tx: Tx,
  pessoaId: string,
  gatilho: TipoEvento,
  contexto: ContextoMovimento,
): Promise<ResultadoMovimento> {
  const [destino] = await tx
    .select()
    .from(estagios)
    .where(eq(estagios.gatilhoAutomatico, gatilho))
    .orderBy(asc(estagios.ordem))
    .limit(1);
  if (!destino) return { movido: false, motivo: "sem_estagio_com_gatilho" };

  // Trava a pessoa até o fim da transação: dois movimentos simultâneos não se atropelam.
  const [pessoa] = await tx
    .select({ estagioId: pessoas.estagioId })
    .from(pessoas)
    .where(eq(pessoas.id, pessoaId))
    .for("update");
  if (!pessoa) return { movido: false, motivo: "pessoa_nao_encontrada" };

  let atual: typeof estagios.$inferSelect | undefined;
  if (pessoa.estagioId) {
    [atual] = await tx.select().from(estagios).where(eq(estagios.id, pessoa.estagioId));
  }
  if (atual && atual.tipo !== "aberto") return { movido: false, motivo: "estagio_final" };
  if (destino.ordem <= (atual?.ordem ?? 0)) return { movido: false, motivo: "nao_avanca" };

  await tx
    .update(pessoas)
    .set({ estagioId: destino.id, atualizadoEm: new Date() })
    .where(eq(pessoas.id, pessoaId));

  await inserirEventoSeNaoExiste(tx, {
    pessoaId,
    tipo: "estagio_alterado",
    ocorridoEm: contexto.ocorridoEm,
    canal: contexto.canal,
    numeroMonitorado: contexto.numeroMonitorado ?? null,
    usuarioId: null,
    entradaBrutaId: contexto.entradaBrutaId ?? null,
    dados: {
      de: atual?.id ?? null,
      para: destino.id,
      de_nome: atual?.nome ?? null,
      para_nome: destino.nome,
      automatico: true,
      gatilho,
    },
  });

  return { movido: true, de: atual?.id ?? null, para: destino.id };
}

/**
 * Coloca no estágio inicial (o de menor `ordem`) a pessoa que ainda não tem estágio.
 * Não grava evento: é a entrada da pessoa no funil, não uma mudança de estágio.
 * Retorna true se definiu o estágio.
 */
export async function definirEstagioInicialSeVazio(tx: Tx, pessoaId: string): Promise<boolean> {
  const [inicial] = await tx
    .select({ id: estagios.id })
    .from(estagios)
    .orderBy(asc(estagios.ordem))
    .limit(1);
  if (!inicial) return false;
  const atualizadas = await tx
    .update(pessoas)
    .set({ estagioId: inicial.id, atualizadoEm: new Date() })
    .where(and(eq(pessoas.id, pessoaId), isNull(pessoas.estagioId)))
    .returning({ id: pessoas.id });
  return atualizadas.length > 0;
}
