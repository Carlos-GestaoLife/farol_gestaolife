import { z } from "zod";
import "@/lib/zod-ptbr";
import { tipoOrigem } from "@/db/schema/enums";
import { normalizarTexto } from "@/nucleo/normalizacao";

// Regras puras da tela Origens: validação do formulário, rótulos e o link do WhatsApp.

export const TIPOS_ORIGEM = tipoOrigem.enumValues;
export type TipoOrigem = (typeof TIPOS_ORIGEM)[number];

export const ROTULO_TIPO_ORIGEM: Record<TipoOrigem, string> = {
  anuncio_ctwa: "Anúncio de clique para WhatsApp",
  link_whatsapp: "Link do WhatsApp",
  qr_code: "QR Code",
  form_meta: "Formulário da Meta",
  lp: "Landing page",
  organico: "Orgânico",
  indicacao: "Indicação",
  desconhecida: "Desconhecida",
};

/** Tipos que usam texto pré-preenchido com link do WhatsApp e QR Code. */
export const TIPOS_COM_LINK: TipoOrigem[] = ["link_whatsapp", "qr_code"];

export const MAX_TEXTO_PREENCHIDO = 300;
const CODIGO = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const ID_META = /^\d{1,30}$/;

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

const idMetaOpcional = (rotulo: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || ID_META.test(v), `${rotulo}: use só números`);

export const origemFormSchema = z.object({
  codigo: z
    .string({ error: "Informe o código" })
    .trim()
    .toLowerCase()
    .min(1, "Informe o código")
    .max(80, "Código longo demais (máximo 80)")
    .regex(
      CODIGO,
      "Código: só letras minúsculas sem acento, números, hífen ou sublinhado, sem espaços (ex.: gnv-maceio-2026)",
    ),
  nome: z
    .string({ error: "Informe o nome" })
    .trim()
    .min(1, "Informe o nome")
    .max(120, "Nome longo demais (máximo 120)"),
  tipo: z.enum(TIPOS_ORIGEM, { error: "Escolha um tipo válido" }),
  // Texto como a pessoa vai enviar; o que fica gravado é a forma normalizada (padrao_texto).
  texto_preenchido: z
    .string()
    .max(MAX_TEXTO_PREENCHIDO, `Texto pré-preenchido: no máximo ${MAX_TEXTO_PREENCHIDO} caracteres`)
    .optional()
    .transform((v) => (v && normalizarTexto(v) ? v.trim() : null)),
  meta_campaign_id: idMetaOpcional("Campanha da Meta"),
  meta_adset_id: idMetaOpcional("Conjunto de anúncios da Meta"),
  meta_ad_id: idMetaOpcional("Anúncio da Meta"),
  meta_form_id: idMetaOpcional("Formulário da Meta"),
  utm_source: opcional(120),
  utm_medium: opcional(120),
  utm_campaign: opcional(200),
  cidade: opcional(120),
  evento: opcional(120),
  produto: opcional(120),
  ativo: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export type OrigemForm = z.output<typeof origemFormSchema>;

/** Colunas da tabela `origens` a partir do formulário validado. */
export function colunasDaOrigem(d: OrigemForm) {
  return {
    codigo: d.codigo,
    nome: d.nome,
    tipo: d.tipo,
    padraoTexto: d.texto_preenchido ? normalizarTexto(d.texto_preenchido) : null,
    metaCampaignId: d.meta_campaign_id,
    metaAdsetId: d.meta_adset_id,
    metaAdId: d.meta_ad_id,
    metaFormId: d.meta_form_id,
    utmSource: d.utm_source,
    utmMedium: d.utm_medium,
    utmCampaign: d.utm_campaign,
    cidade: d.cidade,
    evento: d.evento,
    produto: d.produto,
    ativo: d.ativo,
  };
}

/**
 * Link do WhatsApp com texto pré-preenchido: https://wa.me/{numero}?text={texto codificado}.
 * `numero` só com dígitos (forma canônica, com DDI). Sem texto, o link vai sem `text`.
 */
export function montarLinkWhatsapp(numero: string, texto: string | null | undefined): string {
  const digitos = numero.replace(/\D/g, "");
  const t = texto?.trim();
  return t ? `https://wa.me/${digitos}?text=${encodeURIComponent(t)}` : `https://wa.me/${digitos}`;
}
