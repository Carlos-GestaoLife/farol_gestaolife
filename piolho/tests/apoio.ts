// Apoio dos testes (não é arquivo de teste: o Vitest só roda *.test.ts).
import type { ItemMensagem } from "../src/shared/protocol";

/** Item mínimo válido do contrato. */
export function item(id: string, enviadaEm: string, direcao: "in" | "out" = "in"): ItemMensagem {
  return {
    wa_msg_id: id,
    chat_id: "556288887777@c.us",
    direcao,
    enviada_em: enviadaEm,
    tipo_midia: "texto",
    contato: { wa_id: "556288887777@c.us", telefone: "5562988887777", nome_agenda: null, pushname: null },
    texto_abertura: null,
    ctwa: null,
  };
}
