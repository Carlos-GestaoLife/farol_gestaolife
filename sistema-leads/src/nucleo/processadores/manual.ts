import { z } from "zod";
import type { Tx } from "@/db";
import { inserirEventoSeNaoExiste } from "../eventos";
import { montarIdentificadores, resolverPessoa } from "../identidade";
import type { EntradaBruta } from "../registro";

// Processador da fonte `manual`: lançamento feito por um usuário (nota sobre um lead).
// Serve de modelo para os processadores das próximas etapas: valida o payload com zod,
// resolve a pessoa e grava eventos de forma reexecutável.

const textoOpcional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional()
  .nullable();

export const payloadManualSchema = z.object({
  nome: textoOpcional,
  telefone: textoOpcional,
  email: textoOpcional,
  nota: textoOpcional,
  usuarioId: textoOpcional,
});

export type PayloadManual = z.infer<typeof payloadManualSchema>;

export async function processarManual(tx: Tx, entrada: EntradaBruta): Promise<void> {
  const payload = payloadManualSchema.parse(entrada.payload);

  const lista = montarIdentificadores({ telefone: payload.telefone, email: payload.email });
  if (lista.length === 0) {
    throw new Error("Entrada manual sem telefone ou e-mail válido");
  }

  const { pessoaId } = await resolverPessoa(tx, lista, {
    nomeExibicao: payload.nome,
    entradaBrutaId: entrada.id,
  });

  await inserirEventoSeNaoExiste(tx, {
    pessoaId,
    tipo: "nota",
    ocorridoEm: entrada.recebidoEm,
    canal: "manual",
    usuarioId: payload.usuarioId ?? null,
    entradaBrutaId: entrada.id,
    dados: { nota: payload.nota ?? null },
  });
}
