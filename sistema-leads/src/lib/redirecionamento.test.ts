import { describe, expect, it } from "vitest";
import { destinoSeguro } from "./redirecionamento";

describe("destinoSeguro", () => {
  it("aceita caminhos internos", () => {
    expect(destinoSeguro("/kanban")).toBe("/kanban");
    expect(destinoSeguro("/leads?busca=maria")).toBe("/leads?busca=maria");
  });

  it("recusa destinos externos ou estranhos", () => {
    expect(destinoSeguro("https://evil.com")).toBe("/");
    expect(destinoSeguro("//evil.com")).toBe("/");
    expect(destinoSeguro("/\\evil.com")).toBe("/");
    expect(destinoSeguro("kanban")).toBe("/");
    expect(destinoSeguro(undefined)).toBe("/");
    expect(destinoSeguro(["/a", "/b"])).toBe("/");
  });

  it("não volta para o próprio login nem para a API", () => {
    expect(destinoSeguro("/login")).toBe("/");
    expect(destinoSeguro("/api/auth/get-session")).toBe("/");
  });
});
