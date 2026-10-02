import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { canalEvento, tipoEvento } from "./enums";
import { entradasBrutas } from "./entradas-brutas";
import { numeros } from "./numeros";
import { origens } from "./origens";
import { pessoas } from "./pessoas";

/**
 * Linha do tempo da pessoa. Só recebe linhas novas: nunca UPDATE ou DELETE.
 * Correção é um evento novo.
 */
export const eventos = pgTable(
  "eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pessoaId: uuid("pessoa_id")
      .notNull()
      .references(() => pessoas.id),
    tipo: tipoEvento("tipo").notNull(),
    ocorridoEm: timestamp("ocorrido_em", { withTimezone: true, mode: "date" }).notNull(),
    registradoEm: timestamp("registrado_em", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    canal: canalEvento("canal"),
    origemId: uuid("origem_id").references(() => origens.id),
    numeroMonitorado: text("numero_monitorado").references(() => numeros.numero),
    // Quem fez, se a ação foi manual.
    usuarioId: text("usuario_id").references(() => user.id),
    entradaBrutaId: uuid("entrada_bruta_id").references(() => entradasBrutas.id),
    // UTMs, ids de anúncio, estágio de/para etc.
    dados: jsonb("dados"),
  },
  (t) => [index("eventos_pessoa_id_ocorrido_em_idx").on(t.pessoaId, t.ocorridoEm)],
);
