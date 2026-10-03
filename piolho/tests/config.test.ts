import { describe, expect, it } from "vitest";
import { URL_SISTEMA_PADRAO, normalizarUrlSistema, padraoDeHost } from "../src/shared/config";
import { VALIDADE_ESTADO_MS, interpretarEstado } from "../src/sidepanel/state/useEstado";

describe("URL do sistema", () => {
  it("normaliza barra final e espaços", () => {
    expect(normalizarUrlSistema(` ${URL_SISTEMA_PADRAO}/ `)).toBe(URL_SISTEMA_PADRAO);
  });

  it("aceita https e http só em localhost", () => {
    expect(normalizarUrlSistema("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizarUrlSistema("http://exemplo.com")).toBeNull();
    expect(normalizarUrlSistema("ftp://exemplo.com")).toBeNull();
    expect(normalizarUrlSistema("https://exemplo.com?x=1")).toBeNull();
    expect(normalizarUrlSistema("")).toBeNull();
  });

  it("gera o padrão de permissão de host sem a porta", () => {
    expect(padraoDeHost("http://localhost:3000")).toBe("http://localhost/*");
    expect(padraoDeHost("https://leads.exemplo.com.br")).toBe("https://leads.exemplo.com.br/*");
    expect(padraoDeHost("nada")).toBeNull();
  });
});

describe("interpretarEstado (banner)", () => {
  const agora = Date.parse("2026-10-03T12:00:00Z");
  const recebido_em = new Date(agora - 1000).toISOString();
  const estado = { wpp_pronto: true, autenticado: true, sincronizado: true, numero_proprio: "5562999998888", erro: null };

  it("conectado com número", () => {
    const c = interpretarEstado({ estado, aba_id: 1, recebido_em }, agora);
    expect(c.situacao).toBe("conectado");
    expect(c.numero).toBe("5562999998888");
  });

  it("desconectado sem aba ou com estado velho", () => {
    expect(interpretarEstado({ estado: null, aba_id: null, recebido_em: null }, agora).situacao).toBe("desconectado");
    const velho = new Date(agora - VALIDADE_ESTADO_MS - 1).toISOString();
    expect(interpretarEstado({ estado, aba_id: 1, recebido_em: velho }, agora).situacao).toBe("desconectado");
  });

  it("falha do wa-js, carregando e sem login", () => {
    const base = { aba_id: 1, recebido_em };
    expect(interpretarEstado({ ...base, estado: { ...estado, wpp_pronto: false, erro: "x" } }, agora).situacao).toBe("falha_wajs");
    expect(interpretarEstado({ ...base, estado: { ...estado, wpp_pronto: false } }, agora).situacao).toBe("carregando");
    expect(interpretarEstado({ ...base, estado: { ...estado, autenticado: false } }, agora).situacao).toBe("nao_autenticado");
  });
});
