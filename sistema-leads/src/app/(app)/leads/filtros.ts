import { z } from "zod";
import { SEM_RESPONSAVEL, type FiltrosPessoas } from "@/consultas/pessoas";

// Leitura dos filtros da tela Leads a partir dos searchParams (validados com zod).
// Valor inválido é ignorado (vira "sem filtro") em vez de quebrar a página.

export type ParametrosBusca = Record<string, string | string[] | undefined>;

const uuid = z.uuid();
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

/** Início do dia em Brasília (UTC-3, sem horário de verão desde 2019). */
function inicioDoDia(data: string): Date | null {
  if (!dataIso.safeParse(data).success) return null;
  const d = new Date(`${data}T00:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type FiltrosLeads = {
  /** Valores como vieram (para preencher o formulário e montar os links). */
  valores: {
    busca: string;
    origem: string;
    cidade: string;
    estagio: string;
    responsavel: string;
    de: string;
    ate: string;
  };
  filtros: FiltrosPessoas;
  pagina: number;
};

export function lerFiltrosLeads(params: ParametrosBusca): FiltrosLeads {
  const valores = {
    busca: primeiro(params.busca).slice(0, 200),
    origem: primeiro(params.origem),
    cidade: primeiro(params.cidade).slice(0, 100),
    estagio: primeiro(params.estagio),
    responsavel: primeiro(params.responsavel),
    de: primeiro(params.de),
    ate: primeiro(params.ate),
  };
  const ate = inicioDoDia(valores.ate);
  const responsavel =
    valores.responsavel === SEM_RESPONSAVEL || /^[\w-]{1,100}$/.test(valores.responsavel)
      ? valores.responsavel
      : "";
  const pagina = Number.parseInt(primeiro(params.pagina), 10);
  return {
    valores,
    filtros: {
      busca: valores.busca || null,
      origemId: uuid.safeParse(valores.origem).success ? valores.origem : null,
      cidade: valores.cidade || null,
      estagioId: uuid.safeParse(valores.estagio).success ? valores.estagio : null,
      responsavelId: responsavel || null,
      primeiroContatoDe: inicioDoDia(valores.de),
      // "Até" inclui o dia inteiro: compara com o início do dia seguinte.
      primeiroContatoAte: ate ? new Date(ate.getTime() + 24 * 60 * 60 * 1000) : null,
    },
    pagina: Number.isFinite(pagina) && pagina > 0 ? Math.min(pagina, 100_000) : 1,
  };
}

/** Query string com os filtros atuais e a página pedida (sem parâmetros vazios). */
export function linkPagina(valores: FiltrosLeads["valores"], pagina: number): string {
  const qs = new URLSearchParams();
  for (const [chave, valor] of Object.entries(valores)) if (valor) qs.set(chave, valor);
  if (pagina > 1) qs.set("pagina", String(pagina));
  const texto = qs.toString();
  return texto ? `/leads?${texto}` : "/leads";
}
