import { integer, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { canalVenda, fonteVenda, statusConciliacao } from "./enums";
import { pessoas } from "./pessoas";

/**
 * Vendas (Fase 2). A venda lançada pelo vendedor e a venda da plataforma são conciliadas
 * e apontam uma para a outra por `venda_par_id`.
 */
export const vendas = pgTable("vendas", {
  id: uuid("id").primaryKey().defaultRandom(),
  pessoaId: uuid("pessoa_id")
    .notNull()
    .references(() => pessoas.id),
  produto: text("produto").notNull(),
  valorCentavos: integer("valor_centavos").notNull(),
  canal: canalVenda("canal").notNull(),
  evento: text("evento"),
  fonte: fonteVenda("fonte").notNull(),
  referenciaExterna: text("referencia_externa"),
  registradaPor: text("registrada_por").references(() => user.id),
  ocorridaEm: timestamp("ocorrida_em", { withTimezone: true, mode: "date" }).notNull(),
  conciliacaoStatus: statusConciliacao("conciliacao_status").default("pendente").notNull(),
  vendaParId: uuid("venda_par_id").references((): AnyPgColumn => vendas.id),
  criadoEm: timestamp("criado_em", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
