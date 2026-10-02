/**
 * Valida o destino vindo de `?next=` para evitar redirecionamento aberto: só caminhos internos
 * ("/algo"), nunca "//host", "/\host" ou URLs absolutas. Destino inválido vira "/".
 */
export function destinoSeguro(valor: unknown): string {
  if (typeof valor !== "string" || valor.length === 0 || valor.length > 2000) return "/";
  if (!valor.startsWith("/") || valor.startsWith("//") || valor.startsWith("/\\")) return "/";
  if (valor === "/login" || valor.startsWith("/login?") || valor.startsWith("/api/")) return "/";
  return valor;
}
