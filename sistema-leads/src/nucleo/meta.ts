import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { lerSegredo } from "@/lib/segredos";
import { normalizarNomeCampo } from "./framer";

// Lead Ads da Meta: assinatura do webhook, leitura das notificações `leadgen`, busca do lead
// na Graph API e extração dos campos do formulário. Sem acesso ao banco.
//
// Formato da notificação (objeto Page, campo `leadgen`):
//   { "object": "page", "entry": [ { "id": "<page_id>", "time": 1438292065, "changes": [
//     { "field": "leadgen", "value": { "leadgen_id": "...", "page_id": "...", "form_id": "...",
//       "adgroup_id": "...", "ad_id": "...", "created_time": 1440120384 } } ] } ] }
// Assinatura: header `X-Hub-Signature-256: sha256=<HMAC-SHA256 do corpo cru com o App Secret>`.

export const VERSAO_GRAPH = "v21.0";
const TIMEOUT_GRAPH_MS = 10_000;

/** Confere `X-Hub-Signature-256` (HMAC-SHA256 do corpo CRU) em tempo constante. */
export function assinaturaMetaValida(
  corpoCru: string,
  cabecalho: string | null,
  segredo: string,
): boolean {
  if (!cabecalho) return false;
  const casamento = /^sha256=([0-9a-fA-F]{64})$/.exec(cabecalho.trim());
  if (!casamento) return false;
  const esperado = createHmac("sha256", segredo).update(corpoCru, "utf8").digest();
  const recebido = Buffer.from(casamento[1], "hex");
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

const CHAVES_ID = /"(id|leadgen_id|page_id|form_id|adgroup_id|ad_id|adset_id|campaign_id)"(\s*:\s*)(\d+)(?![\d.eE])/g;

/**
 * JSON.parse que não perde precisão nos ids da Meta: o valor numérico das chaves de id vira
 * string ANTES do parse (ids da Meta podem passar de 2^53 e o JSON.parse os arredondaria).
 * Só as chaves de id são tocadas; dentro de um texto as aspas viriam escapadas e não casam.
 */
export function parseJsonComIdsGrandes(texto: string): unknown {
  return JSON.parse(texto.replace(CHAVES_ID, '"$1"$2"$3"'));
}

const idTexto = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .pipe(z.string().min(1));

const idOpcional = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim()));

const notificacaoSchema = z.object({
  object: z.string().optional(),
  entry: z.array(
    z.object({
      id: idOpcional,
      time: z.unknown().optional(),
      changes: z
        .array(z.object({ field: z.string(), value: z.unknown() }))
        .optional()
        .default([]),
    }),
  ),
});

const valorLeadgenSchema = z
  .object({
    leadgen_id: idTexto,
    form_id: idOpcional,
    ad_id: idOpcional,
    page_id: idOpcional,
    adgroup_id: idOpcional,
    created_time: z.union([z.number(), z.string()]).nullish(),
  })
  .loose();

export type LeadNotificado = {
  leadgen_id: string;
  form_id: string | null;
  ad_id: string | null;
  page_id: string | null;
  created_time: number | string | null;
  /** Objeto `value` completo, como veio. */
  change: Record<string, unknown>;
  entry_id: string | null;
};

export type NotificacaoMeta =
  | { ok: true; leads: LeadNotificado[]; ignorados: number }
  | { ok: false; erro: string };

/** Lê a notificação e devolve um item por `entry[].changes[]` com `field === "leadgen"`. */
export function interpretarNotificacaoMeta(texto: string): NotificacaoMeta {
  let json: unknown;
  try {
    json = parseJsonComIdsGrandes(texto);
  } catch {
    return { ok: false, erro: "Corpo não é um JSON válido" };
  }
  const notificacao = notificacaoSchema.safeParse(json);
  if (!notificacao.success) return { ok: false, erro: "JSON sem a lista entry[] esperada" };

  const leads: LeadNotificado[] = [];
  let ignorados = 0;
  for (const entry of notificacao.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "leadgen") {
        ignorados++;
        continue;
      }
      const valor = valorLeadgenSchema.safeParse(change.value);
      if (!valor.success) {
        ignorados++;
        continue;
      }
      const v = valor.data;
      leads.push({
        leadgen_id: v.leadgen_id,
        form_id: v.form_id,
        ad_id: v.ad_id,
        page_id: v.page_id,
        created_time: v.created_time ?? null,
        change: change.value as Record<string, unknown>,
        entry_id: entry.id,
      });
    }
  }
  return { ok: true, leads, ignorados };
}

/** Data do lead: segundos Unix (webhook) ou texto ISO, inclusive "+0000" (Graph API). */
export function dataMeta(valor: number | string | null | undefined): Date | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number" || /^\d+$/.test(valor)) {
    const n = Number(valor);
    const data = new Date(n < 1e12 ? n * 1000 : n);
    return Number.isNaN(data.getTime()) ? null : data;
  }
  // "2026-10-02T14:03:11+0000" vira "...+00:00" (formato que o Date entende em todo lugar).
  const iso = valor.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : data;
}

export const leadGraphSchema = z
  .object({
    id: idTexto,
    created_time: z.string().nullish(),
    ad_id: idOpcional,
    adset_id: idOpcional,
    campaign_id: idOpcional,
    form_id: idOpcional,
    field_data: z
      .array(
        z
          .object({
            name: z.string(),
            values: z.array(z.unknown()).nullish(),
          })
          .loose(),
      )
      .nullish(),
  })
  .loose();

export type LeadGraph = z.infer<typeof leadGraphSchema>;

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Busca o lead na Graph API: GET /{leadgen_id}?fields=field_data,ad_id,adset_id,campaign_id,
 * form_id,created_time, com o token da página no header Authorization (nunca na URL, para não
 * aparecer em log). Falha de rede, timeout ou HTTP não 2xx lançam erro com o status e a
 * mensagem da Graph API, sem o token. `fetchFn` é injetável para os testes.
 */
export async function buscarLeadNaGraph(
  leadgenId: string,
  fetchFn: FetchFn = (url, init) => fetch(url, init),
): Promise<LeadGraph> {
  const token = lerSegredo("META_PAGE_ACCESS_TOKEN");
  if (!token) throw new Error("META_PAGE_ACCESS_TOKEN não configurado: não há como buscar o lead");
  if (!/^\d{1,30}$/.test(leadgenId)) throw new Error(`leadgen_id inválido: ${leadgenId}`);

  const url =
    `https://graph.facebook.com/${VERSAO_GRAPH}/${leadgenId}` +
    `?fields=field_data,ad_id,adset_id,campaign_id,form_id,created_time`;
  const semToken = (texto: string) => texto.split(token).join("***");

  let resposta: Response;
  try {
    resposta = await fetchFn(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_GRAPH_MS),
      cache: "no-store",
    });
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message || erro.name : String(erro);
    throw new Error(semToken(`Falha de rede ao chamar a Graph API (lead ${leadgenId}): ${msg}`));
  }

  const texto = await resposta.text().catch(() => "");
  let json: unknown = null;
  try {
    json = texto ? parseJsonComIdsGrandes(texto) : null;
  } catch {
    json = null;
  }

  if (!resposta.ok) {
    const erroGraph = (json as { error?: Record<string, unknown> } | null)?.error;
    const detalhes = erroGraph
      ? [
          String(erroGraph.message ?? "sem mensagem"),
          erroGraph.type ? `tipo ${String(erroGraph.type)}` : null,
          erroGraph.code !== undefined ? `código ${String(erroGraph.code)}` : null,
          erroGraph.error_subcode !== undefined ? `subcódigo ${String(erroGraph.error_subcode)}` : null,
          erroGraph.fbtrace_id ? `fbtrace_id ${String(erroGraph.fbtrace_id)}` : null,
        ]
          .filter(Boolean)
          .join(", ")
      : texto.slice(0, 300) || "sem corpo";
    throw new Error(
      semToken(`Graph API respondeu HTTP ${resposta.status} para o lead ${leadgenId}: ${detalhes}`),
    );
  }

  const lead = leadGraphSchema.safeParse(json);
  if (!lead.success) {
    throw new Error(`Resposta inesperada da Graph API para o lead ${leadgenId}: ${texto.slice(0, 300)}`);
  }
  return lead.data;
}

const SINONIMOS_META = {
  nome: ["full_name", "nome", "name", "nome_completo", "first_name"],
  telefone: ["phone_number", "telefone", "phone", "whatsapp", "celular"],
  email: ["email", "e_mail"],
  cidade: ["city", "cidade"],
} as const;

type CampoMeta = keyof typeof SINONIMOS_META;

const CAMPO_META_POR_NOME = new Map<string, CampoMeta>(
  (Object.entries(SINONIMOS_META) as [CampoMeta, readonly string[]][]).flatMap(([campo, nomes]) =>
    nomes.map((n) => [n, campo] as [string, CampoMeta]),
  ),
);

export type CamposMeta = {
  campos: Record<CampoMeta, string | null>;
  /** Demais perguntas do formulário: nome do campo => valor (ou lista, se vier mais de um). */
  outros: Record<string, string | string[] | null>;
};

/** Extrai os campos de `field_data` (array de { name, values: [] }), com sinônimos. */
export function extrairCamposMeta(fieldData: LeadGraph["field_data"]): CamposMeta {
  const campos: Record<CampoMeta, string | null> = {
    nome: null,
    telefone: null,
    email: null,
    cidade: null,
  };
  const outros: CamposMeta["outros"] = {};
  for (const item of fieldData ?? []) {
    const valores = (item.values ?? [])
      .map((v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v)))
      .filter((v) => v !== "");
    const campo = CAMPO_META_POR_NOME.get(normalizarNomeCampo(item.name));
    if (campo) {
      campos[campo] ??= valores[0] ?? null;
    } else if (!(item.name in outros)) {
      outros[item.name] = valores.length === 0 ? null : valores.length === 1 ? valores[0] : valores;
    }
  }
  return { campos, outros };
}
