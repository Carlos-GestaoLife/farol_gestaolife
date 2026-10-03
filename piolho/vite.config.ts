// Copiado da extensão de referência (github.com/Carlos-GestaoLife/extrator_contatos), com o
// namespace dos plugins trocado de "wage" para "piolho".
// Passe 1 do build (ESM, code-splitting normal): side panel e service worker.
// Os content scripts (content.js e main-world.js) saem de vite.config.content.ts nos passes 2 e 3,
// porque precisam ser IIFE. Ver o script "build" no package.json.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { construirManifest } from "./manifest.config.ts";
import { urlSistemaDoBuild } from "./src/shared/config.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Build de desenvolvimento: PIOLHO_SISTEMA_URL=http://localhost:3000 npm run build. A URL vira o
// padrão da configuração e entra em host_permissions; sem a variável, vale a produção.
const URL_SISTEMA = urlSistemaDoBuild(process.env.PIOLHO_SISTEMA_URL);
const BUILD_DEV = Boolean(process.env.PIOLHO_SISTEMA_URL?.trim());

export default defineConfig({
  define: {
    __PIOLHO_SISTEMA_URL__: JSON.stringify(URL_SISTEMA),
    __PIOLHO_DEV__: JSON.stringify(BUILD_DEV),
  },
  plugins: [
    react(),
    {
      name: "piolho-manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: JSON.stringify(construirManifest(URL_SISTEMA), null, 2) + "\n",
        });
      },
    },
    {
      // Copia o wa-js vendorizado para dist/, onde o manifest o referencia no MAIN world.
      name: "piolho-vendor",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "vendor/wa-js/wppconnect-wa.js",
          // Lido como bytes (sem conversão de texto) para sair idêntico ao arquivo vendorizado.
          source: readFileSync(resolve(__dirname, "vendor/wa-js/wppconnect-wa.js")),
        });
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "src/sidepanel/index.html"),
        "service-worker": resolve(__dirname, "src/background/service-worker.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
