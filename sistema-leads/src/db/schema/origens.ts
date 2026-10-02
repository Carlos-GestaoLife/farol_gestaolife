import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tipoOrigem } from "./enums";

/** Origens de lead (anúncios, links, QR Codes, formulários, LPs). */
export const origens = pgTable("origens", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  nome: text("nome").notNull(),
  tipo: tipoOrigem("tipo").notNull(),
  // Texto pré-preenchido, já normalizado.
  padraoTexto: text("padrao_texto"),
  metaCampaignId: text("meta_campaign_id"),
  metaAdsetId: text("meta_adset_id"),
  metaAdId: text("meta_ad_id"),
  metaFormId: text("meta_form_id"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  cidade: text("cidade"),
  evento: text("evento"),
  produto: text("produto"),
  ativo: boolean("ativo").default(true).notNull(),
  criadaAutomaticamente: boolean("criada_automaticamente").default(false).notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
