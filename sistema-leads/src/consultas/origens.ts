import { asc, eq, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { numeros, origens } from "@/db/schema";

// Consultas da tela Origens (gestão).

export type OrigemComContagem = typeof origens.$inferSelect & {
  /** Pessoas (não mescladas) cuja origem do primeiro toque é esta. */
  leads: number;
  /** Eventos (toques) atribuídos a esta origem. */
  toques: number;
};

const colunas = {
  id: origens.id,
  codigo: origens.codigo,
  nome: origens.nome,
  tipo: origens.tipo,
  padraoTexto: origens.padraoTexto,
  metaCampaignId: origens.metaCampaignId,
  metaAdsetId: origens.metaAdsetId,
  metaAdId: origens.metaAdId,
  metaFormId: origens.metaFormId,
  utmSource: origens.utmSource,
  utmMedium: origens.utmMedium,
  utmCampaign: origens.utmCampaign,
  cidade: origens.cidade,
  evento: origens.evento,
  produto: origens.produto,
  ativo: origens.ativo,
  criadaAutomaticamente: origens.criadaAutomaticamente,
  criadoEm: origens.criadoEm,
  // "origens"."id" escrito por extenso: dentro de sql`` no select, o Drizzle renderiza a coluna
  // sem o nome da tabela, e "id" casaria com a coluna da subconsulta.
  leads: sql<number>`(
    select count(*)::int from pessoas p
    where p.origem_primeiro_toque_id = "origens"."id" and p.mesclada_para_id is null
  )`,
  toques: sql<number>`(select count(*)::int from eventos e where e.origem_id = "origens"."id")`,
};

/** Todas as origens com as contagens: ativas primeiro, depois por nome. */
export async function listarOrigensComContagem(
  executor: Executor = db,
): Promise<OrigemComContagem[]> {
  return executor
    .select(colunas)
    .from(origens)
    .orderBy(sql`${origens.ativo} desc`, asc(origens.nome));
}

export async function carregarOrigem(
  id: string,
  executor: Executor = db,
): Promise<OrigemComContagem | null> {
  const [linha] = await executor.select(colunas).from(origens).where(eq(origens.id, id));
  return linha ?? null;
}

export type OpcaoNumero = { numero: string; apelido: string | null };

/** Números monitorados, para o link do WhatsApp. */
export async function listarNumerosOpcoes(executor: Executor = db): Promise<OpcaoNumero[]> {
  return executor
    .select({ numero: numeros.numero, apelido: numeros.apelido })
    .from(numeros)
    .orderBy(asc(numeros.apelido), asc(numeros.numero));
}
