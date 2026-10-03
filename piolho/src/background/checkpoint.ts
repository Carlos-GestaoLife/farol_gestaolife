// Checkpoint local por número monitorado, em chrome.storage.local (sobrevive a reiniciar o Chrome):
// checkpoint[numero] = maior enviada_em já ACEITO pelo servidor. Só avança depois do aceite
// (regra "nada se perde"); a varredura da Etapa 7 parte do maior entre ele e ultimo_sync_servidor.
import { CHAVES_STORAGE } from "../shared/config";

export type MapaCheckpoint = Record<string, string>;

/** Novo mapa com o checkpoint do número avançado para `iso`, se for maior. Pura. */
export function avancar(mapa: MapaCheckpoint, numero: string, iso: string): MapaCheckpoint {
  const novo = Date.parse(iso);
  if (!Number.isFinite(novo)) return mapa;
  const atual = mapa[numero] ? Date.parse(mapa[numero]) : Number.NEGATIVE_INFINITY;
  if (Number.isFinite(atual) && atual >= novo) return mapa;
  return { ...mapa, [numero]: new Date(novo).toISOString() };
}

/** Maior enviada_em de uma lista de itens (ISO), ou null. Pura. */
export function maiorEnviadaEm(itens: { enviada_em: string }[]): string | null {
  let maior = Number.NEGATIVE_INFINITY;
  for (const item of itens) {
    const t = Date.parse(item.enviada_em);
    if (Number.isFinite(t) && t > maior) maior = t;
  }
  return Number.isFinite(maior) ? new Date(maior).toISOString() : null;
}

async function lerMapa(): Promise<MapaCheckpoint> {
  try {
    const dados = await chrome.storage.local.get(CHAVES_STORAGE.checkpoint);
    const v: unknown = dados[CHAVES_STORAGE.checkpoint];
    if (v && typeof v === "object") {
      const mapa: MapaCheckpoint = {};
      for (const [k, iso] of Object.entries(v as Record<string, unknown>)) {
        if (typeof iso === "string" && Number.isFinite(Date.parse(iso))) mapa[k] = iso;
      }
      return mapa;
    }
  } catch (erro) {
    console.warn("[PIOLHO] não consegui ler o checkpoint", erro);
  }
  return {};
}

export async function lerCheckpoint(numero: string): Promise<string | null> {
  return (await lerMapa())[numero] ?? null;
}

/** Serializa as gravações: dois lotes aceitos em sequência nunca se sobrescrevem. */
let fila: Promise<void> = Promise.resolve();

export function avancarCheckpoint(numero: string, iso: string): Promise<void> {
  fila = fila.then(async () => {
    const mapa = await lerMapa();
    const novo = avancar(mapa, numero, iso);
    if (novo !== mapa) await chrome.storage.local.set({ [CHAVES_STORAGE.checkpoint]: novo });
  }).catch((erro: unknown) => console.warn("[PIOLHO] não consegui gravar o checkpoint", erro));
  return fila;
}
