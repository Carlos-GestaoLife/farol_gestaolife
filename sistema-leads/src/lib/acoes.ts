import type { z } from "zod";

// Apoio às Server Actions das telas (estado devolvido para useActionState).

export type EstadoAcao = {
  ok: boolean;
  /** Mensagem para o usuário (sucesso ou erro). */
  mensagem: string | null;
  /** Valores enviados, para refazer o formulário depois de um erro (nunca senhas). */
  valores?: Record<string, string>;
  /** Segredo mostrado uma única vez (token novo do dispositivo). */
  token?: string;
};

export const ESTADO_INICIAL: EstadoAcao = { ok: false, mensagem: null };

/** Campos de texto do FormData num objeto simples (arquivos são ignorados). */
export function camposDoFormulario(formData: FormData): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const [chave, valor] of formData.entries()) {
    if (typeof valor === "string" && !chave.startsWith("$ACTION")) campos[chave] = valor;
  }
  return campos;
}

/** Primeira mensagem de erro do zod, para mostrar no formulário. */
export function primeiroErro(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Dados inválidos";
}

/** Erro de violação de unicidade do Postgres (código 23505), direto ou encapsulado pelo Drizzle. */
export function ehViolacaoUnica(erro: unknown): boolean {
  let atual: unknown = erro;
  for (let i = 0; i < 5 && atual && typeof atual === "object"; i++) {
    if ((atual as { code?: unknown }).code === "23505") return true;
    atual = (atual as { cause?: unknown }).cause;
  }
  return false;
}
