import { NextResponse } from "next/server";
import { executarDepois } from "@/lib/depois";
import {
  processarEntradasMeta,
  receberWebhookMeta,
  verificarWebhookMeta,
} from "@/nucleo/webhook-meta";

// GET e POST /api/webhooks/meta: webhook de Lead Ads (objeto Page, campo `leadgen`).
// A lógica fica em src/nucleo/webhook-meta.ts; roteiro de teste real em docs/WEBHOOKS.md.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Tempo para o processamento depois da resposta (after() estende a função até aqui).
export const maxDuration = 60;

/** Verificação da assinatura do webhook no painel da Meta: devolve o hub.challenge. */
export async function GET(request: Request) {
  const { status, texto } = verificarWebhookMeta(new URL(request.url).searchParams);
  return new NextResponse(texto, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * Notificação de lead: valida X-Hub-Signature-256 sobre o corpo CRU, grava e responde 200
 * rápido; a busca na Graph API e o processamento rodam DEPOIS da resposta, com `after()`
 * (fallback síncrono fora de um request do Next, ver src/lib/depois.ts).
 */
export async function POST(request: Request) {
  const texto = await request.text();
  const resposta = await receberWebhookMeta({
    texto,
    assinatura: request.headers.get("x-hub-signature-256"),
  });
  if (resposta.idsParaProcessar.length > 0) {
    const ids = resposta.idsParaProcessar;
    await executarDepois(() => processarEntradasMeta(ids));
  }
  return NextResponse.json(resposta.corpo, { status: resposta.status });
}
