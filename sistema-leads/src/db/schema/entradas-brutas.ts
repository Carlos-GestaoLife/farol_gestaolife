import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { fonteEntrada, statusEntrada } from "./enums";

/**
 * Toda entrada é gravada aqui crua, ANTES de qualquer processamento (regra "nada se perde").
 * `(fonte, chave_idempotencia)` é único: reenviar nunca duplica.
 */
export const entradasBrutas = pgTable(
  "entradas_brutas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fonte: fonteEntrada("fonte").notNull(),
    chaveIdempotencia: text("chave_idempotencia").notNull(),
    payload: jsonb("payload").notNull(),
    recebidoEm: timestamp("recebido_em", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    status: statusEntrada("status").default("pendente").notNull(),
    tentativas: integer("tentativas").default(0).notNull(),
    erro: text("erro"),
    processadoEm: timestamp("processado_em", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    unique("entradas_brutas_fonte_chave_idempotencia_unique").on(t.fonte, t.chaveIdempotencia),
    index("entradas_brutas_status_idx").on(t.status),
  ],
);
