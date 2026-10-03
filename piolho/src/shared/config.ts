// Configuração fixa da extensão, compartilhada entre manifest, service worker e side panel.

/** URL do Sistema de Leads em produção (Vercel). É o padrão do build normal. */
export const URL_SISTEMA_PRODUCAO = "https://farol-sistema-leads.vercel.app";

/**
 * Substituído pelo Vite no build (define em vite.config.ts e vite.config.content.ts) com a URL de
 * PIOLHO_SISTEMA_URL, ou com URL_SISTEMA_PRODUCAO quando a variável não existe. Fora do build
 * (Node, Vitest, o próprio manifest.config.ts) o identificador não existe e vale a produção.
 */
declare const __PIOLHO_SISTEMA_URL__: string | undefined;

/** Substituído pelo Vite: true só no build de desenvolvimento (PIOLHO_SISTEMA_URL definida). */
declare const __PIOLHO_DEV__: boolean | undefined;

/**
 * URL padrão do Sistema de Leads. Precisa constar em host_permissions do manifest (ver
 * manifest.config.ts, que recebe a mesma URL do build). Outra URL só funciona depois de concedida
 * em tempo de execução (optional_host_permissions) ou com um novo build.
 */
export const URL_SISTEMA_PADRAO: string =
  typeof __PIOLHO_SISTEMA_URL__ === "string" && __PIOLHO_SISTEMA_URL__ !== ""
    ? __PIOLHO_SISTEMA_URL__
    : URL_SISTEMA_PRODUCAO;

/** Build de desenvolvimento (habilita o gatilho de teste `tick_teste` no service worker). */
export const BUILD_DEV: boolean = typeof __PIOLHO_DEV__ === "boolean" ? __PIOLHO_DEV__ : false;

/** Padrão de host do WhatsApp Web, usado no manifest e na busca de abas. */
export const URL_WHATSAPP = "https://web.whatsapp.com/*";

/** Nome do alarm de 1 minuto do service worker (fila e heartbeat). */
export const ALARM_TICK = "piolho-tick";

/** Chaves usadas em chrome.storage.local. */
export const CHAVES_STORAGE = {
  urlSistema: "urlSistema",
  token: "token",
  /** Por número monitorado: maior enviada_em já aceito pelo servidor (ISO). */
  checkpoint: "checkpoint",
} as const;

/**
 * Converte uma URL base em padrão de host_permissions ("https://exemplo.com/*").
 * Devolve null se a URL não for http(s) válida.
 */
export function padraoDeHost(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    // Permissões de host ignoram a porta: "http://localhost/*" cobre localhost:3000.
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

/**
 * Normaliza a URL do sistema digitada no painel: tira espaços e barras finais. Aceita só
 * https, ou http em localhost (desenvolvimento), que são os hosts cobertos por
 * optional_host_permissions no manifest. Devolve null se inválida.
 */
export function normalizarUrlSistema(entrada: string): string | null {
  const texto = entrada.trim();
  if (texto === "") return null;
  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    return null;
  }
  const local = u.hostname === "localhost";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
  if (u.username || u.password || u.search || u.hash) return null;
  const caminho = u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${u.host}${caminho}`;
}

/**
 * URL do sistema para o build, a partir de PIOLHO_SISTEMA_URL (vite.config.ts). Vazia ou ausente:
 * produção. Inválida: lança, para o build falhar em vez de gerar uma extensão quebrada.
 */
export function urlSistemaDoBuild(valor: string | undefined): string {
  if (valor === undefined || valor.trim() === "") return URL_SISTEMA_PRODUCAO;
  const normalizada = normalizarUrlSistema(valor);
  if (normalizada === null) {
    throw new Error(`PIOLHO_SISTEMA_URL inválida: "${valor}". Use https:// ou http://localhost.`);
  }
  return normalizada;
}
