// Configuração fixa da extensão, compartilhada entre manifest, service worker e side panel.

/**
 * URL padrão do Sistema de Leads (produção na Vercel). Precisa constar em host_permissions do
 * manifest (ver manifest.config.ts). Outra URL só funciona depois de concedida em tempo de
 * execução (optional_host_permissions) ou com um novo build.
 */
export const URL_SISTEMA_PADRAO = "https://farol-sistema-leads.vercel.app";

/** Padrão de host do WhatsApp Web, usado no manifest e na busca de abas. */
export const URL_WHATSAPP = "https://web.whatsapp.com/*";

/** Nome do alarm de 1 minuto do service worker (fila e heartbeat a partir da Etapa 3). */
export const ALARM_TICK = "piolho-tick";

/** Chaves usadas em chrome.storage.local. */
export const CHAVES_STORAGE = {
  urlSistema: "urlSistema",
  token: "token",
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
