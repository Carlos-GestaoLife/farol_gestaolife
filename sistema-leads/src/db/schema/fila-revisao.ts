import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { statusRevisao, tipoRevisao } from "./enums";
import { entradasBrutas } from "./entradas-brutas";
import { pessoas } from "./pessoas";

/** Conflitos de identidade (e outros casos) que precisam de decisão humana. */
export const filaRevisao = pgTable("fila_revisao", {
  id: uuid("id").primaryKey().defaultRandom(),
  tipo: tipoRevisao("tipo").notNull(),
  pessoaAId: uuid("pessoa_a_id").references(() => pessoas.id),
  pessoaBId: uuid("pessoa_b_id").references(() => pessoas.id),
  motivo: text("motivo"),
  entradaBrutaId: uuid("entrada_bruta_id").references(() => entradasBrutas.id),
  status: statusRevisao("status").default("aberta").notNull(),
  resolvidoPor: text("resolvido_por").references(() => user.id),
  resolvidoEm: timestamp("resolvido_em", { withTimezone: true, mode: "date" }),
  criadoEm: timestamp("criado_em", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
