import { NextResponse } from "next/server";
import { lerJson, respostaErro } from "@/lib/api";
import { autenticarDispositivo } from "@/nucleo/dispositivos";
import { ingerirWhatsapp } from "@/nucleo/ingestao-whatsapp";

// POST /api/ingest/whatsapp: lote de até 100 mensagens (só metadados) enviado pelo piolho.
// Contrato na seção "API de ingestão" do CLAUDE.md do sistema-leads. A lógica fica em
// src/nucleo/ingestao-whatsapp.ts; aqui só autenticação, JSON e resposta.

export const runtime = "nodejs";
// Lote de 100 mensagens processadas uma a uma (cada uma na sua transação).
export const maxDuration = 60;

export async function POST(request: Request) {
  const dispositivo = await autenticarDispositivo(request);
  if (!dispositivo) return respostaErro(401, "Token inválido");

  const json = await lerJson(request);
  if (!json.ok) return respostaErro(400, "Corpo da requisição não é um JSON válido");

  const resposta = await ingerirWhatsapp(dispositivo, json.corpo);
  return NextResponse.json(resposta.corpo, { status: resposta.status });
}
