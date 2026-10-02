import { NextResponse } from "next/server";

// Apoio aos Route Handlers de ingestão e webhooks: respostas JSON em português.

export function respostaErro(status: number, erro: string) {
  return NextResponse.json({ erro }, { status });
}

/** Lê o corpo JSON. Corpo ausente ou malformado: null. */
export async function lerJson(
  request: Request,
): Promise<{ ok: true; corpo: unknown } | { ok: false }> {
  try {
    return { ok: true, corpo: await request.json() };
  } catch {
    return { ok: false };
  }
}
