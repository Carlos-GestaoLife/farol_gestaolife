import { NextResponse } from "next/server";
import { lerJson, respostaErro } from "@/lib/api";
import { autenticarDispositivo } from "@/nucleo/dispositivos";
import { registrarHeartbeat } from "@/nucleo/ingestao-whatsapp";

// POST /api/ingest/heartbeat: sinal de vida do piolho (contrato no CLAUDE.md do sistema-leads).
// A lógica fica em src/nucleo/ingestao-whatsapp.ts; aqui só autenticação, JSON e resposta.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const dispositivo = await autenticarDispositivo(request);
  if (!dispositivo) return respostaErro(401, "Token inválido");

  const json = await lerJson(request);
  if (!json.ok) return respostaErro(400, "Corpo da requisição não é um JSON válido");

  const resposta = await registrarHeartbeat(dispositivo, json.corpo);
  return NextResponse.json(resposta.corpo, { status: resposta.status });
}
