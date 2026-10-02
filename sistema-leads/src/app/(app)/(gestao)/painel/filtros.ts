import { z } from "zod";
import type { FiltrosPainel } from "@/consultas/painel";
import { chaveDia } from "@/lib/formatacao";

// Filtros do Painel a partir dos searchParams: período (de/até, dias inteiros no horário de
// Brasília; padrão: últimos 30 dias, hoje incluído), cidade e origem opcionais.
// Valor inválido vira o padrão em vez de quebrar a página.

export type ParametrosBusca = Record<string, string | string[] | undefined>;

const DIA_MS = 24 * 60 * 60 * 1000;
export const DIAS_PADRAO = 30;
/** Período máximo, para a série por dia não ficar gigante. */
export const DIAS_MAXIMO = 366;

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

export type FiltrosPainelTela = {
  valores: { de: string; ate: string; cidade: string; origem: string };
  filtros: FiltrosPainel;
  dias: number;
};

export function lerFiltrosPainel(params: ParametrosBusca, agora: Date = new Date()): FiltrosPainelTela {
  const hoje = chaveDia(agora);
  let ateDia = inicioDoDia(primeiro(params.ate)) ? primeiro(params.ate) : hoje;
  let deDia = inicioDoDia(primeiro(params.de))
    ? primeiro(params.de)
    : chaveDia(new Date(inicioDoDia(ateDia)!.getTime() - (DIAS_PADRAO - 1) * DIA_MS + 12 * 60 * 60 * 1000));
  if (deDia > ateDia) [deDia, ateDia] = [ateDia, deDia];
  const de = inicioDoDia(deDia)!;
  let ateExclusivo = new Date(inicioDoDia(ateDia)!.getTime() + DIA_MS);
  if (ateExclusivo.getTime() - de.getTime() > DIAS_MAXIMO * DIA_MS) {
    ateExclusivo = new Date(de.getTime() + DIAS_MAXIMO * DIA_MS);
    ateDia = chaveDia(new Date(ateExclusivo.getTime() - DIA_MS));
  }
  const origem = primeiro(params.origem);
  const cidade = primeiro(params.cidade).slice(0, 100);
  const origemValida = z.uuid().safeParse(origem).success ? origem : "";
  return {
    valores: { de: deDia, ate: ateDia, cidade, origem: origemValida },
    filtros: { de, ate: ateExclusivo, cidade: cidade || null, origemId: origemValida || null },
    dias: Math.round((ateExclusivo.getTime() - de.getTime()) / DIA_MS),
  };
}
