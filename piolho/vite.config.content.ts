// Copiado da extensão de referência (github.com/Carlos-GestaoLife/extrator_contatos), com o
// namespace trocado de "WAGE" para "PIOLHO".
// Passes 2 e 3 do build: content scripts em IIFE, um passe por entrada.
//
// Por que IIFE: o Chrome não carrega ESM em content_scripts.js (nem no mundo isolado nem no
// MAIN world), então cada arquivo precisa ser um script clássico autocontido, sem import/export.
// Por que passes separados: o formato IIFE aceita uma entrada só por build, então
// content.js e main-world.js saem de execuções diferentes (--mode content e --mode main-world).
// O passe 1 (vite.config.ts) limpa dist/; aqui emptyOutDir fica false para não apagar nada.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { urlSistemaDoBuild } from "./src/shared/config.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ENTRADAS = {
  content: { entrada: "src/content/index.ts", saida: "content.js", nome: "PIOLHOContent" },
  "main-world": { entrada: "src/main-world/index.ts", saida: "main-world.js", nome: "PIOLHOMainWorld" },
} as const;

type ModoConteudo = keyof typeof ENTRADAS;

function ehModoConteudo(mode: string): mode is ModoConteudo {
  return Object.prototype.hasOwnProperty.call(ENTRADAS, mode);
}

export default defineConfig(({ mode }) => {
  if (!ehModoConteudo(mode)) {
    throw new Error(
      `vite.config.content.ts: mode "${mode}" inválido. Use --mode content ou --mode main-world.`,
    );
  }
  const { entrada, saida, nome } = ENTRADAS[mode];

  return {
    // Os ícones de public/ já foram copiados no passe 1.
    publicDir: false,
    // Modo lib não substitui process.env.NODE_ENV sozinho.
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      // Mesmos valores do passe 1 (vite.config.ts), para src/shared/config.ts ficar igual em tudo.
      __PIOLHO_SISTEMA_URL__: JSON.stringify(urlSistemaDoBuild(process.env.PIOLHO_SISTEMA_URL)),
      __PIOLHO_DEV__: JSON.stringify(Boolean(process.env.PIOLHO_SISTEMA_URL?.trim())),
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, entrada),
        formats: ["iife"],
        name: nome,
        fileName: () => saida,
      },
      rollupOptions: {
        output: {
          format: "iife",
          entryFileNames: saida,
          codeSplitting: false,
        },
      },
    },
  };
});
