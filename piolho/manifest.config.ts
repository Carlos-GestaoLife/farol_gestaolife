// Manifest da extensão, gerado em build pelo plugin "piolho-manifest" do vite.config.ts.
// Estrutura copiada da extensão de referência (github.com/Carlos-GestaoLife/extrator_contatos).
// A versão vem do package.json para existir uma fonte única.
import pkg from "./package.json" with { type: "json" };
import { URL_SISTEMA_PRODUCAO, URL_WHATSAPP, padraoDeHost } from "./src/shared/config.ts";

const ICONES = {
  16: "icons/icon16.png",
  48: "icons/icon48.png",
  128: "icons/icon128.png",
};

/**
 * @param urlSistema URL do Sistema de Leads deste build (PIOLHO_SISTEMA_URL ou produção, ver
 *   urlSistemaDoBuild em src/shared/config.ts). Entra em host_permissions.
 */
export function construirManifest(urlSistema: string = URL_SISTEMA_PRODUCAO) {
  const hostSistema = padraoDeHost(urlSistema);
  if (hostSistema === null) throw new Error(`URL do sistema inválida para o manifest: ${urlSistema}`);
  return {
    manifest_version: 3,
    name: "Piolho",
    version: pkg.version,
    description: "Envia metadados das conversas do WhatsApp Web para o Sistema de Leads Gestão Life.",
    minimum_chrome_version: "114",
    icons: ICONES,
    action: {
      default_title: "Abrir o Piolho",
      default_icon: ICONES,
    },
    permissions: ["sidePanel", "storage", "alarms"],
    // A URL do Sistema de Leads PRECISA constar aqui: o service worker faz fetch nela (heartbeat e
    // ingestão) e, sem a permissão de host, o Chrome bloqueia por CORS. Uma URL diferente (por
    // exemplo localhost em desenvolvimento, ou outro domínio) exige um build com
    // PIOLHO_SISTEMA_URL (ver README), OU ser concedida em tempo de execução pelo painel, via
    // chrome.permissions.request, graças a optional_host_permissions abaixo.
    host_permissions: [URL_WHATSAPP, hostSistema],
    optional_host_permissions: ["http://localhost/*", "https://*/*"],
    background: {
      service_worker: "service-worker.js",
      type: "module",
    },
    side_panel: {
      default_path: "src/sidepanel/index.html",
    },
    content_scripts: [
      {
        // MAIN world: o wa-js vendorizado precisa carregar ANTES do main-world.js (ordem importa).
        matches: [URL_WHATSAPP],
        js: ["vendor/wa-js/wppconnect-wa.js", "main-world.js"],
        world: "MAIN",
        run_at: "document_start",
      },
      {
        // Mundo isolado: relay entre a página e o service worker.
        matches: [URL_WHATSAPP],
        js: ["content.js"],
        run_at: "document_start",
      },
    ],
  };
}
