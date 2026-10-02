import { and, asc, eq, isNotNull, or } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { eventos, origens } from "@/db/schema";

// Primeiro e último toque de uma pessoa (seção "Atribuição de origem" do CLAUDE.md).
// - Primeiro toque: o evento mais antigo com origem (o mesmo que fica em cache em
//   `pessoas.origem_primeiro_toque_id`).
// - Último toque: o último evento com origem ANTES da primeira `venda_registrada`; sem venda,
//   o último de todos. Não é cache: é calculado aqui. Usado na tela Pessoa e no Painel.

export type OrigemDoToque = { id: string; codigo: string; nome: string; tipo: string };

export type Toque = {
  origem: OrigemDoToque;
  evento: { id: string; tipo: string; canal: string | null };
  ocorridoEm: Date;
};

export type PrimeiroEUltimoToque = { primeiro: Toque | null; ultimo: Toque | null };

/** Evento lido para o cálculo: toques (com origem) e vendas. */
export type EventoDeToque = {
  id: string;
  tipo: string;
  canal: string | null;
  ocorridoEm: Date;
  registradoEm: Date;
  origem: OrigemDoToque | null;
};

function porData(a: EventoDeToque, b: EventoDeToque): number {
  return (
    a.ocorridoEm.getTime() - b.ocorridoEm.getTime() ||
    a.registradoEm.getTime() - b.registradoEm.getTime() ||
    a.id.localeCompare(b.id)
  );
}

function comoToque(e: EventoDeToque): Toque {
  return {
    origem: e.origem!,
    evento: { id: e.id, tipo: e.tipo, canal: e.canal },
    ocorridoEm: e.ocorridoEm,
  };
}

/** Cálculo PURO do primeiro e do último toque a partir dos eventos da pessoa. */
export function calcularToques(lista: EventoDeToque[]): PrimeiroEUltimoToque {
  const ordenados = [...lista].sort(porData);
  const comOrigem = ordenados.filter((e) => e.origem);
  if (comOrigem.length === 0) return { primeiro: null, ultimo: null };

  const venda = ordenados.find((e) => e.tipo === "venda_registrada");
  const antesDaVenda = venda
    ? comOrigem.filter((e) => e.ocorridoEm.getTime() < venda.ocorridoEm.getTime())
    : comOrigem;
  const ultimo = antesDaVenda.at(-1);
  return { primeiro: comoToque(comOrigem[0]), ultimo: ultimo ? comoToque(ultimo) : null };
}

/** Primeiro e último toque da pessoa (consulta só os eventos com origem e as vendas). */
export async function primeiroEUltimoToque(
  pessoaId: string,
  executor: Executor = db,
): Promise<PrimeiroEUltimoToque> {
  const linhas = await executor
    .select({
      id: eventos.id,
      tipo: eventos.tipo,
      canal: eventos.canal,
      ocorridoEm: eventos.ocorridoEm,
      registradoEm: eventos.registradoEm,
      origemId: origens.id,
      origemCodigo: origens.codigo,
      origemNome: origens.nome,
      origemTipo: origens.tipo,
    })
    .from(eventos)
    .leftJoin(origens, eq(origens.id, eventos.origemId))
    .where(
      and(
        eq(eventos.pessoaId, pessoaId),
        or(isNotNull(eventos.origemId), eq(eventos.tipo, "venda_registrada")),
      ),
    )
    .orderBy(asc(eventos.ocorridoEm), asc(eventos.registradoEm));

  return calcularToques(
    linhas.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      canal: l.canal,
      ocorridoEm: l.ocorridoEm,
      registradoEm: l.registradoEm,
      origem:
        l.origemId && l.origemCodigo && l.origemNome && l.origemTipo
          ? { id: l.origemId, codigo: l.origemCodigo, nome: l.origemNome, tipo: l.origemTipo }
          : null,
    })),
  );
}
