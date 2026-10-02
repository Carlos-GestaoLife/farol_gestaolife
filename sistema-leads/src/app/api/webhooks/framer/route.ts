import { NextResponse } from "next/server";
import { receberWebhookFramer } from "@/nucleo/webhook-framer";

// POST /api/webhooks/framer?k={FRAMER_WEBHOOK_SECRET}: envio de formulário das LPs do Framer.
// Lê o corpo CRU (JSON ou formulário), grava em `entradas_brutas` e processa na hora.
// A lógica fica em src/nucleo/webhook-framer.ts; roteiro de teste real em docs/WEBHOOKS.md.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const texto = await request.text();
  const resposta = await receberWebhookFramer({
    k: url.searchParams.get("k"),
    texto,
    contentType: request.headers.get("content-type"),
    userAgent: request.headers.get("user-agent"),
    submissionId: request.headers.get("framer-webhook-submission-id"),
  });
  return NextResponse.json(resposta.corpo, { status: resposta.status });
}
