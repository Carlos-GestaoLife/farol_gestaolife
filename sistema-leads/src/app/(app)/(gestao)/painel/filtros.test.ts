import { describe, expect, it } from "vitest";
import { lerFiltrosPainel } from "./filtros";

describe("lerFiltrosPainel", () => {
  const agora = new Date("2026-10-02T15:00:00Z"); // 02/10 12h em Brasília

  it("padrão: últimos 30 dias, hoje incluído", () => {
    const f = lerFiltrosPainel({}, agora);
    expect(f.valores).toMatchObject({ de: "2026-09-03", ate: "2026-10-02" });
    expect(f.filtros.de.toISOString()).toBe("2026-09-03T03:00:00.000Z");
    expect(f.filtros.ate.toISOString()).toBe("2026-10-03T03:00:00.000Z");
    expect(f.dias).toBe(30);
  });

  it("aceita de/até, inverte se vierem trocados e ignora origem inválida", () => {
    const f = lerFiltrosPainel({ de: "2026-09-10", ate: "2026-09-01", origem: "x", cidade: " Goiânia " }, agora);
    expect(f.valores).toMatchObject({ de: "2026-09-01", ate: "2026-09-10", origem: "", cidade: "Goiânia" });
    expect(f.filtros.origemId).toBeNull();
    expect(f.filtros.cidade).toBe("Goiânia");
    expect(f.dias).toBe(10);
  });
});
