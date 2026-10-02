import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tipoEstagio, tipoEvento } from "./enums";

/** Colunas do kanban. `gatilho_automatico` é o tipo de evento que move a pessoa para cá. */
export const estagios = pgTable("estagios", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull().unique(),
  ordem: integer("ordem").notNull(),
  tipo: tipoEstagio("tipo").notNull(),
  gatilhoAutomatico: tipoEvento("gatilho_automatico"),
});
