import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** Computadores com o piolho instalado. O token é guardado só como hash. */
export const dispositivos = pgTable("dispositivos", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Ex.: "PC Comercial 1".
  nome: text("nome").notNull(),
  usuarioId: text("usuario_id").references(() => user.id),
  tokenHash: text("token_hash").notNull().unique(),
  numeroDetectado: text("numero_detectado"),
  ultimoSinalEm: timestamp("ultimo_sinal_em", { withTimezone: true, mode: "date" }),
  ultimoSyncEm: timestamp("ultimo_sync_em", { withTimezone: true, mode: "date" }),
  filaPendente: integer("fila_pendente").default(0).notNull(),
  versaoExtensao: text("versao_extensao"),
  ativo: boolean("ativo").default(true).notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
