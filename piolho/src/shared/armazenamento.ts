// Configuração persistida em chrome.storage.local: URL do sistema e token do dispositivo.
// Usado pelo side panel (Etapa 1) e pelo service worker (heartbeat e envio, Etapas 2 e 3).
// O token é gravado aqui e lido só pelo service worker; o painel nunca o exibe depois de salvo.
import { CHAVES_STORAGE, URL_SISTEMA_PADRAO, normalizarUrlSistema } from "./config";
import { LIMITES } from "./protocol";

export async function lerUrlSistema(): Promise<string> {
  try {
    const dados = await chrome.storage.local.get(CHAVES_STORAGE.urlSistema);
    const valor: unknown = dados[CHAVES_STORAGE.urlSistema];
    if (typeof valor === "string") return normalizarUrlSistema(valor) ?? URL_SISTEMA_PADRAO;
  } catch (erro) {
    console.warn("[PIOLHO] não consegui ler a URL do sistema", erro);
  }
  return URL_SISTEMA_PADRAO;
}

export async function salvarUrlSistema(url: string): Promise<void> {
  const normalizada = normalizarUrlSistema(url);
  if (normalizada === null) throw new Error("URL inválida.");
  await chrome.storage.local.set({ [CHAVES_STORAGE.urlSistema]: normalizada });
}

/** Token do dispositivo, ou null. Só o service worker deve usar o valor. */
export async function lerToken(): Promise<string | null> {
  try {
    const dados = await chrome.storage.local.get(CHAVES_STORAGE.token);
    const valor: unknown = dados[CHAVES_STORAGE.token];
    if (typeof valor === "string" && valor.length > 0 && valor.length <= LIMITES.token) return valor;
  } catch (erro) {
    console.warn("[PIOLHO] não consegui ler o token", erro);
  }
  return null;
}

export async function tokenConfigurado(): Promise<boolean> {
  return (await lerToken()) !== null;
}

export async function salvarToken(token: string): Promise<void> {
  const limpo = token.trim();
  if (limpo.length === 0 || limpo.length > LIMITES.token) throw new Error("Token inválido.");
  await chrome.storage.local.set({ [CHAVES_STORAGE.token]: limpo });
}

export async function removerToken(): Promise<void> {
  await chrome.storage.local.remove(CHAVES_STORAGE.token);
}

/** Nome deste computador (só informativo, local). Null se não configurado. */
export async function lerNomeComputador(): Promise<string | null> {
  try {
    const valor: unknown = (await chrome.storage.local.get(CHAVES_STORAGE.nomeComputador))[CHAVES_STORAGE.nomeComputador];
    if (typeof valor === "string" && valor.trim()) return valor.trim().slice(0, LIMITES.nomeComputador);
  } catch (erro) {
    console.warn("[PIOLHO] não consegui ler o nome do computador", erro);
  }
  return null;
}

/** Grava o nome (vazio remove). */
export async function salvarNomeComputador(nome: string): Promise<void> {
  const limpo = nome.trim().slice(0, LIMITES.nomeComputador);
  if (limpo) await chrome.storage.local.set({ [CHAVES_STORAGE.nomeComputador]: limpo });
  else await chrome.storage.local.remove(CHAVES_STORAGE.nomeComputador);
}

/** Modo descoberta ligado (Etapa 5, só diagnóstico). */
export async function lerModoDescoberta(): Promise<boolean> {
  try {
    return (await chrome.storage.local.get(CHAVES_STORAGE.descoberta))[CHAVES_STORAGE.descoberta] === true;
  } catch {
    return false;
  }
}

export async function salvarModoDescoberta(ativo: boolean): Promise<void> {
  await chrome.storage.local.set({ [CHAVES_STORAGE.descoberta]: ativo });
}
