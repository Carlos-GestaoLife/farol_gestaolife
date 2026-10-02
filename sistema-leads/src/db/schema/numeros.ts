import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { papelNumero } from "./enums";

/** Números de WhatsApp monitorados. `numero` é a forma canônica (com DDI e nono dígito). */
export const numeros = pgTable("numeros", {
  numero: text("numero").primaryKey(),
  apelido: text("apelido"),
  papel: papelNumero("papel"),
  usuarioId: text("usuario_id").references(() => user.id),
  criadoEm: timestamp("criado_em", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
