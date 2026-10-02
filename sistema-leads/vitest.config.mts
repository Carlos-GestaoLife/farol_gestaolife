import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mesmo alias do tsconfig ("@/..." aponta para src/).
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Os testes de integração usam o mesmo banco de teste: arquivos rodam um de cada vez.
    fileParallelism: false,
  },
});
