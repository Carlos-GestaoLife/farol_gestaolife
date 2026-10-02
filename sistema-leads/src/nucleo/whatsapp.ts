import { z } from "zod";
import "@/lib/zod-ptbr";
import { tipoMidia } from "@/db/schema/enums";
import { casaPadrao } from "./normalizacao";

// Contrato da ingestão do WhatsApp (seção "API de ingestão" do CLAUDE.md do sistema-leads)
// e regras puras usadas pelo processador. Sem acesso ao banco: tudo aqui é testável à parte.

export const MAX_ITENS_WHATSAPP = 100;
export const MAX_TEXTO_ABERTURA = 300;
/** Janela sem mensagens no chat para que uma mensagem recebida abra uma conversa nova. */
export const JANELA_CONVERSA_DIAS = 30;

/** Texto opcional: aceita ausente, null ou string; vazio vira null. */
function textoOpcional(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
}

const dataIso = z.iso.datetime({
  offset: true,
  error: "deve ser data ISO 8601 com fuso (ex.: 2026-10-02T14:03:11Z)",
});

export const contatoSchema = z.object({
  wa_id: z.string().trim().min(1).max(200),
  telefone: textoOpcional(40),
  nome_agenda: textoOpcional(200),
  pushname: textoOpcional(200),
});

export const itemWhatsappSchema = z.object({
  wa_msg_id: z.string().trim().min(1).max(300),
  chat_id: z.string().trim().min(1).max(200),
  direcao: z.enum(["in", "out"]),
  enviada_em: dataIso,
  tipo_midia: z.enum(tipoMidia.enumValues),
  contato: contatoSchema,
  // A extensão já corta em 300; aqui é só a garantia. O processador ainda aplica a regra
  // de descarte (abertura de conversa ou padrão cadastrado).
  texto_abertura: z
    .string()
    .max(MAX_TEXTO_ABERTURA)
    .nullish()
    .transform((v) => v ?? null),
  ctwa: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((v) => v ?? null),
});

export type ItemWhatsapp = z.output<typeof itemWhatsappSchema>;

/** Payload gravado em `entradas_brutas` (fonte whatsapp): o item mais o contexto do envio. */
export const payloadEntradaWhatsappSchema = itemWhatsappSchema.extend({
  numero_monitorado: z.string().min(1),
  dispositivo_id: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  versao_extensao: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
});

export type PayloadEntradaWhatsapp = z.output<typeof payloadEntradaWhatsappSchema>;

const loteSchema = z.object({
  versao_extensao: z.string().trim().min(1).max(50),
  numero_monitorado: z.string().trim().min(1).max(40),
  itens: z.array(z.unknown()),
});

export const heartbeatSchema = z.object({
  numero_monitorado: z.string().trim().min(1).max(40),
  versao_extensao: z.string().trim().min(1).max(50),
  fila_pendente: z.number().int().min(0),
  ultimo_sync_em: dataIso.nullable(),
});

export type ErroItem = { wa_msg_id: string | null; motivo: string };

export type ResultadoValidacaoLote =
  | {
      ok: true;
      versaoExtensao: string;
      numeroMonitorado: string;
      validos: ItemWhatsapp[];
      erros: ErroItem[];
    }
  | { ok: false; erro: string };

/** Lista os problemas do zod em uma linha: "campo: mensagem; outro.campo: mensagem". */
export function descreverErrosZod(erro: z.ZodError): string {
  return erro.issues
    .map((issue) =>
      issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    )
    .join("; ");
}

/**
 * Valida o corpo de POST /api/ingest/whatsapp. Problema no envelope (campos de fora ou mais de
 * 100 itens) rejeita o lote todo; item inválido vai para `erros` com o motivo e não derruba
 * os demais. O número monitorado volta como veio (a normalização fica com a rota).
 */
export function validarLoteWhatsapp(corpo: unknown): ResultadoValidacaoLote {
  const envelope = loteSchema.safeParse(corpo);
  if (!envelope.success) {
    return { ok: false, erro: `Corpo inválido: ${descreverErrosZod(envelope.error)}` };
  }
  const { itens } = envelope.data;
  if (itens.length > MAX_ITENS_WHATSAPP) {
    return {
      ok: false,
      erro: `Máximo de ${MAX_ITENS_WHATSAPP} itens por chamada (recebidos: ${itens.length})`,
    };
  }

  const validos: ItemWhatsapp[] = [];
  const erros: ErroItem[] = [];
  for (const bruto of itens) {
    const r = itemWhatsappSchema.safeParse(bruto);
    if (r.success) {
      validos.push(r.data);
    } else {
      const id =
        bruto &&
        typeof bruto === "object" &&
        typeof (bruto as { wa_msg_id?: unknown }).wa_msg_id === "string"
          ? (bruto as { wa_msg_id: string }).wa_msg_id
          : null;
      erros.push({ wa_msg_id: id, motivo: `Item inválido: ${descreverErrosZod(r.error)}` });
    }
  }

  return {
    ok: true,
    versaoExtensao: envelope.data.versao_extensao,
    numeroMonitorado: envelope.data.numero_monitorado,
    validos,
    erros,
  };
}

/**
 * Regra do `texto_abertura` (o servidor descarta o que não cumprir). Mantém o texto só se:
 * (a) a mensagem é recebida (`in`) e abre a conversa (nenhuma mensagem daquele chat no mesmo
 *     número nos 30 dias anteriores); ou
 * (b) o texto casa com algum padrão cadastrado em `origens.padrao_texto` (igual ou "começa com",
 *     após normalizar).
 */
export function deveManterTextoAbertura(params: {
  direcao: "in" | "out";
  abreConversa: boolean;
  texto: string | null | undefined;
  padroes: readonly string[];
}): boolean {
  const { direcao, abreConversa, texto, padroes } = params;
  if (!texto || texto.trim() === "") return false;
  if (direcao === "in" && abreConversa) return true;
  return padroes.some((padrao) => casaPadrao(texto, padrao));
}

/** Corta o texto em `max` caracteres (pontos de código, sem partir emoji ao meio). */
export function cortarTexto(texto: string, max = MAX_TEXTO_ABERTURA): string {
  const caracteres = Array.from(texto);
  return caracteres.length <= max ? texto : caracteres.slice(0, max).join("");
}
