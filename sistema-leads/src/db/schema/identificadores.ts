import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tipoIdentificador } from "./enums";
import { pessoas } from "./pessoas";

/** Telefone, e-mail, wa_id e meta_lead_id de cada pessoa. `valor` é sempre o normalizado. */
export const identificadores = pgTable(
  "identificadores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pessoaId: uuid("pessoa_id")
      .notNull()
      .references(() => pessoas.id),
    tipo: tipoIdentificador("tipo").notNull(),
    valor: text("valor").notNull(),
    valorOriginal: text("valor_original"),
    criadoEm: timestamp("criado_em", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("identificadores_tipo_valor_unique").on(t.tipo, t.valor),
    index("identificadores_pessoa_id_idx").on(t.pessoaId),
  ],
);
