import { NextResponse } from "next/server";
import { executarReprocessamento } from "@/nucleo/reprocessamento";

// GET e POST /api/cron/reprocessar com `Authorization: Bearer {CRON_SECRET}`.
// GET: Vercel Cron (uma vez por dia, ver vercel.json). POST: n8n (a cada 5 minutos).
// Fica fora do proxy de sessão (matcher em src/proxy.ts). Lógica em src/nucleo/reprocessamento.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function responder(request: Request) {
  const r = await executarReprocessamento(request.headers.get("authorization"));
  return NextResponse.json(r.corpo, { status: r.status });
}

export async function GET(request: Request) {
  return responder(request);
}

export async function POST(request: Request) {
  return responder(request);
}
