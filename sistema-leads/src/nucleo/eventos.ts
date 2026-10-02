import { and, asc, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { eventos } from "@/db/schema";

export type NovoEvento = typeof eventos.$inferInsert;

export type OpcoesInserirEvento = {
  /**
   * Reprocessamento forçado: se o evento já existe SEM origem e o novo traz `origemId`,
   * grava um evento NOVO do mesmo tipo com `dados.reatribuicao = true` e
   * `dados.evento_original_id`. O evento original nunca é alterado (regra de ouro 3).
   */
  permitirReatribuicao?: boolean;
};

export type ResultadoInserirEvento = {
  id: string;
  inserido: boolean;
  /** Verdadeiro quando o evento inserido é uma reatribuição de origem. */
  reatribuido?: boolean;
};

function comoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

/**
 * Insere um evento só se ainda não existir outro com o mesmo `entrada_bruta_id` e `tipo`.
 * É o que torna os processadores reexecutáveis: reprocessar a mesma entrada não duplica a
 * linha do tempo. `eventos` só recebe linhas novas (nunca UPDATE ou DELETE).
 *
 * Sem `entradaBrutaId` não há como deduplicar e o evento é sempre inserido (ações da UI).
 * Com `permitirReatribuicao`, veja `OpcoesInserirEvento`: a reatribuição acontece no máximo
 * uma vez por entrada e tipo (se algum evento dela já tem origem, nada é inserido).
 */
export async function inserirEventoSeNaoExiste(
  tx: Tx,
  evento: NovoEvento,
  opcoes: OpcoesInserirEvento = {},
): Promise<ResultadoInserirEvento> {
  if (evento.entradaBrutaId) {
    const existentes = await tx
      .select({ id: eventos.id, origemId: eventos.origemId, dados: eventos.dados })
      .from(eventos)
      .where(and(eq(eventos.entradaBrutaId, evento.entradaBrutaId), eq(eventos.tipo, evento.tipo)))
      .orderBy(asc(eventos.registradoEm), asc(eventos.id));
    if (existentes.length > 0) {
      const original =
        existentes.find((e) => comoObjeto(e.dados).reatribuicao !== true) ?? existentes[0];
      const algumComOrigem = existentes.some((e) => e.origemId);
      if (!opcoes.permitirReatribuicao || !evento.origemId || algumComOrigem) {
        return { id: original.id, inserido: false };
      }
      const [novo] = await tx
        .insert(eventos)
        .values({
          ...evento,
          dados: {
            ...comoObjeto(evento.dados),
            reatribuicao: true,
            evento_original_id: original.id,
          },
        })
        .returning({ id: eventos.id });
      return { id: novo.id, inserido: true, reatribuido: true };
    }
  }
  const [novo] = await tx.insert(eventos).values(evento).returning({ id: eventos.id });
  return { id: novo.id, inserido: true };
}
