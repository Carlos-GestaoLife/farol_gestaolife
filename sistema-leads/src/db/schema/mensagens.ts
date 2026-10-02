import { index, jsonb, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { dispositivos } from "./dispositivos";
import { direcaoMensagem, tipoMidia } from "./enums";
import { entradasBrutas } from "./entradas-brutas";
import { numeros } from "./numeros";
import { pessoas } from "./pessoas";

/**
 * Metadados de mensagens do WhatsApp (alto volume). Sem conteúdo de conversa:
 * a única exceção é `texto_abertura`, com no máximo 300 caracteres.
 */
export const mensagens = pgTable(
  "mensagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pessoaId: uuid("pessoa_id")
      .notNull()
      .references(() => pessoas.id),
    numeroMonitorado: text("numero_monitorado")
      .notNull()
      .references(() => numeros.numero),
    waMsgId: text("wa_msg_id").notNull(),
    chatId: text("chat_id").notNull(),
    direcao: direcaoMensagem("direcao").notNull(),
    tipoMidia: tipoMidia("tipo_midia").notNull(),
    enviadaEm: timestamp("enviada_em", { withTimezone: true, mode: "date" }).notNull(),
    textoAbertura: varchar("texto_abertura", { length: 300 }),
    ctwa: jsonb("ctwa"),
    dispositivoId: uuid("dispositivo_id").references(() => dispositivos.id),
    entradaBrutaId: uuid("entrada_bruta_id").references(() => entradasBrutas.id),
  },
  (t) => [
    unique("mensagens_numero_monitorado_wa_msg_id_unique").on(t.numeroMonitorado, t.waMsgId),
    index("mensagens_pessoa_id_enviada_em_idx").on(t.pessoaId, t.enviadaEm),
  ],
);
