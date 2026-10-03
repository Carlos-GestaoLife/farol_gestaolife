// Contratos do piolho, validados com zod:
//
// 1. Ponte interna: MAIN world (wa-js) <-> content script <-> service worker <-> side panel.
//    Toda mensagem tem o envelope { ns: "__PIOLHO__", origem, requestId, tipo, payload }.
//    Os validadores são a única defesa contra dados fora do esperado: quem recebe só usa o objeto
//    devolvido pelo validador (o zod descarta campos fora do schema), nunca o dado original.
// 2. Contrato com o servidor (Sistema de Leads): POST /api/ingest/whatsapp e
//    POST /api/ingest/heartbeat. Espelha o schema real de sistema-leads/src/nucleo/whatsapp.ts e a
//    seção "API de ingestão" do sistema-leads/CLAUDE.md. Os dois projetos não compartilham código:
//    se o contrato mudar lá, atualizar aqui.
import { z } from "zod";

// Sem compilação de validadores com new Function: a CSP do WhatsApp Web (MAIN world) e a das
// páginas da extensão (MV3) bloqueiam eval, e a simples tentativa gera aviso de CSP no console.
z.config({ jitless: true });

export const NS = "__PIOLHO__" as const;

/** Tempo máximo de espera por uma resposta na ponte. */
export const TIMEOUT_MS = 30_000;

export const LIMITES = {
  requestId: 64,
  mensagemErro: 1024,
  // Contrato do servidor (mesmos números de sistema-leads/src/nucleo/whatsapp.ts).
  waMsgId: 300,
  chatId: 200,
  waId: 200,
  telefone: 40,
  nome: 200,
  textoAbertura: 300,
  versaoExtensao: 50,
  numeroMonitorado: 40,
  itensPorLote: 100,
  // Configuração.
  url: 500,
  token: 500,
} as const;

/** Mesmos valores do enum tipo_midia do servidor (sistema-leads/src/db/schema/enums.ts). */
export const TIPOS_MIDIA = [
  "texto",
  "audio",
  "imagem",
  "video",
  "documento",
  "figurinha",
  "localizacao",
  "contato",
  "outro",
] as const;

export type TipoMidia = (typeof TIPOS_MIDIA)[number];

// ---------------------------------------------------------------------------
// Peças comuns
// ---------------------------------------------------------------------------

/** Data ISO 8601 com fuso (ex.: 2026-10-02T14:03:11Z), como o servidor exige. */
const dataIso = z.iso.datetime({ offset: true });

/** Telefone canônico produzido por phone.ts: só dígitos, 10 a 15. */
const telefoneCanonico = z.string().regex(/^\d{10,15}$/);

const textoErro = z.string().max(LIMITES.mensagemErro);

// ---------------------------------------------------------------------------
// Contrato com o servidor
// ---------------------------------------------------------------------------

export const contatoSchema = z.object({
  wa_id: z.string().min(1).max(LIMITES.waId),
  telefone: z.string().max(LIMITES.telefone).nullable(),
  nome_agenda: z.string().max(LIMITES.nome).nullable(),
  pushname: z.string().max(LIMITES.nome).nullable(),
});

export type Contato = z.infer<typeof contatoSchema>;

/** Uma mensagem (só metadados) enviada ao servidor. O contato sai completo em todo item. */
export const itemMensagemSchema = z.object({
  wa_msg_id: z.string().min(1).max(LIMITES.waMsgId),
  chat_id: z.string().min(1).max(LIMITES.chatId),
  direcao: z.enum(["in", "out"]),
  enviada_em: dataIso,
  tipo_midia: z.enum(TIPOS_MIDIA),
  contato: contatoSchema,
  /** Só quando a mensagem recebida abre conversa ou casa com padroes_texto (regra na Etapa 6). */
  texto_abertura: z.string().max(LIMITES.textoAbertura).nullable(),
  /** Contexto do anúncio de clique para WhatsApp. Campos a confirmar na Etapa 5 (docs/CTWA.md). */
  ctwa: z.record(z.string(), z.unknown()).nullable(),
});

export type ItemMensagem = z.infer<typeof itemMensagemSchema>;

/** Corpo de POST /api/ingest/whatsapp. */
export const loteIngestaoSchema = z.object({
  versao_extensao: z.string().min(1).max(LIMITES.versaoExtensao),
  numero_monitorado: z.string().min(1).max(LIMITES.numeroMonitorado),
  itens: z.array(itemMensagemSchema).max(LIMITES.itensPorLote),
});

export type LoteIngestao = z.infer<typeof loteIngestaoSchema>;

/** Resposta 200 de POST /api/ingest/whatsapp. Só sai da fila o que vier em `aceitos`. */
export const respostaIngestaoSchema = z.object({
  aceitos: z.array(z.string()),
  // O servidor manda wa_msg_id null quando o item inválido nem tinha id.
  erros: z.array(z.object({ wa_msg_id: z.string().nullable(), motivo: z.string() })),
});

export type RespostaIngestao = z.infer<typeof respostaIngestaoSchema>;

/** Corpo de POST /api/ingest/heartbeat. */
export const heartbeatSchema = z.object({
  numero_monitorado: z.string().min(1).max(LIMITES.numeroMonitorado),
  versao_extensao: z.string().min(1).max(LIMITES.versaoExtensao),
  fila_pendente: z.number().int().min(0),
  ultimo_sync_em: dataIso.nullable(),
});

export type Heartbeat = z.infer<typeof heartbeatSchema>;

/** Resposta 200 de POST /api/ingest/heartbeat. */
export const respostaHeartbeatSchema = z.object({
  ultimo_sync_servidor: dataIso.nullable(),
  padroes_texto: z.array(z.string()),
});

export type RespostaHeartbeat = z.infer<typeof respostaHeartbeatSchema>;

// ---------------------------------------------------------------------------
// Payloads da ponte interna
// ---------------------------------------------------------------------------

/** Estado da aba do WhatsApp, publicado pelo MAIN world. Implementado na Etapa 1. */
export const estadoWhatsappSchema = z.object({
  /** wa-js carregado (WPP.isReady). */
  wpp_pronto: z.boolean(),
  /** Sessão logada (WPP.conn.isAuthenticated). */
  autenticado: z.boolean(),
  /** Interface principal sincronizada (WPP.conn.isMainReady). */
  sincronizado: z.boolean(),
  /** Número da conta logada, forma canônica de phone.ts, ou null se ainda não detectado. */
  numero_proprio: telefoneCanonico.nullable(),
  /** Falha do wa-js (por exemplo, não ficou pronto em 30 s), ou null. */
  erro: textoErro.nullable(),
});

export type EstadoWhatsapp = z.infer<typeof estadoWhatsappSchema>;

/** Mensagem nova capturada ao vivo ou na varredura. TODO Etapa 4 (escuta) e Etapa 7 (varredura). */
export const mensagemNovaSchema = z.object({ item: itemMensagemSchema });

export type MensagemNova = z.infer<typeof mensagemNovaSchema>;

/** Varredura desde o checkpoint. TODO Etapa 7. */
export const varreduraSchema = z.discriminatedUnion("fase", [
  z.object({
    fase: z.literal("pedido"),
    /** Checkpoint: carregar mensagens depois deste instante (limite de 30 dias aplicado no MAIN world). */
    desde: dataIso.nullable(),
  }),
  z.object({
    fase: z.literal("progresso"),
    chats_total: z.number().int().min(0),
    chats_processados: z.number().int().min(0),
    mensagens_enfileiradas: z.number().int().min(0),
    concluida: z.boolean(),
    erro: textoErro.nullable(),
  }),
]);

export type Varredura = z.infer<typeof varreduraSchema>;

/** Configuração (URL do sistema e token) do painel para o service worker. TODO Etapa 2. */
export const configSchema = z.object({
  url_sistema: z.url().max(LIMITES.url),
  token: z.string().min(1).max(LIMITES.token).nullable(),
});

export type Config = z.infer<typeof configSchema>;

/** Situação da fila, do service worker para o painel. TODO Etapa 3 e Etapa 8. */
export const statusFilaSchema = z.object({
  pendentes: z.number().int().min(0),
  ultimo_envio_em: dataIso.nullable(),
  ultimo_erro: textoErro.nullable(),
  token_invalido: z.boolean(),
});

export type StatusFila = z.infer<typeof statusFilaSchema>;

/** Resposta do service worker ao pedido `obter_estado` do painel. */
export const respostaObterEstadoSchema = z.object({
  estado: estadoWhatsappSchema.nullable(),
  aba_id: z.number().int().nullable(),
  /** Quando o service worker recebeu esse estado (ISO). */
  recebido_em: dataIso.nullable(),
});

export type RespostaObterEstado = z.infer<typeof respostaObterEstadoSchema>;

// ---------------------------------------------------------------------------
// Envelope da ponte
// ---------------------------------------------------------------------------

/** Quem montou a mensagem. Cada ponto só aceita as origens que espera. */
export const ORIGENS = ["main", "content", "service_worker", "painel"] as const;
export type Origem = (typeof ORIGENS)[number];

const envelope = {
  ns: z.literal(NS),
  origem: z.enum(ORIGENS),
  requestId: z.string().min(1).max(LIMITES.requestId),
};

export const mensagemPonteSchema = z.discriminatedUnion("tipo", [
  z.object({ ...envelope, tipo: z.literal("estado"), payload: estadoWhatsappSchema }),
  z.object({ ...envelope, tipo: z.literal("mensagem_nova"), payload: mensagemNovaSchema }),
  z.object({ ...envelope, tipo: z.literal("varredura"), payload: varreduraSchema }),
  z.object({ ...envelope, tipo: z.literal("config"), payload: configSchema }),
  z.object({ ...envelope, tipo: z.literal("status_fila"), payload: statusFilaSchema }),
  z.object({ ...envelope, tipo: z.literal("obter_estado"), payload: z.null() }),
]);

export type MensagemPonte = z.infer<typeof mensagemPonteSchema>;
export type TipoMensagem = MensagemPonte["tipo"];
export type PayloadDe<T extends TipoMensagem> = Extract<MensagemPonte, { tipo: T }>["payload"];

/** Valida qualquer coisa recebida pela ponte. Nunca lança; devolve null se inválida. */
export function validarMensagem(v: unknown): MensagemPonte | null {
  const r = mensagemPonteSchema.safeParse(v);
  return r.success ? r.data : null;
}

/** Gera um requestId aleatório e curto (24 caracteres hexadecimais). */
export function novoRequestId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Monta uma mensagem já no formato do envelope. */
export function montarMensagem<T extends TipoMensagem>(
  tipo: T,
  origem: Origem,
  payload: PayloadDe<T>,
  requestId: string = novoRequestId(),
): Extract<MensagemPonte, { tipo: T }> {
  return { ns: NS, origem, requestId, tipo, payload } as Extract<MensagemPonte, { tipo: T }>;
}

/** Converte qualquer erro em texto curto. */
export function mensagemDeErro(err: unknown): string {
  const texto = err instanceof Error && err.message ? err.message : String(err);
  return texto.slice(0, LIMITES.mensagemErro);
}
