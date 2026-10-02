import { boolean, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { estagios } from "./estagios";
import { origens } from "./origens";

/**
 * Uma pessoa (lead). Campos de origem e datas são cache derivado de `eventos` e podem
 * ser recalculados. Mescla nunca apaga: a pessoa absorvida recebe `mesclada_para_id`.
 */
export const pessoas = pgTable("pessoas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nomeExibicao: text("nome_exibicao"),
  estagioId: uuid("estagio_id").references(() => estagios.id),
  responsavelId: text("responsavel_id").references(() => user.id),
  origemPrimeiroToqueId: uuid("origem_primeiro_toque_id").references(() => origens.id),
  primeiroContatoEm: timestamp("primeiro_contato_em", { withTimezone: true, mode: "date" }),
  ultimoContatoEm: timestamp("ultimo_contato_em", { withTimezone: true, mode: "date" }),
  motivoPerda: text("motivo_perda"),
  optOut: boolean("opt_out").default(false).notNull(),
  mescladaParaId: uuid("mesclada_para_id").references((): AnyPgColumn => pessoas.id),
  mescladaEm: timestamp("mesclada_em", { withTimezone: true, mode: "date" }),
  criadoEm: timestamp("criado_em", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true, mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
