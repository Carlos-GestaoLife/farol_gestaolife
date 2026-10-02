import { z } from "zod";
import type { Tx } from "@/db";
import { registrarDataContato } from "../contato";
import { definirEstagioInicialSeVazio } from "../estagios";
import { inserirEventoSeNaoExiste } from "../eventos";
import { montarIdentificadores, resolverPessoa } from "../identidade";
import type { EntradaBruta } from "../registro";

// Processador da fonte `manual`: lançamento feito por um usuário (botão "Novo lead" da tela
// Leads, com nota opcional). Valida o payload com zod, resolve a pessoa, coloca no estágio
// inicial ("Novo lead") se ela ainda não tem estágio e grava o evento `nota` com o usuário que
// lançou (`usuarioId` do payload). Reexecutável como os demais processadores.

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

  const { pessoaId, criada } = await resolverPessoa(tx, lista, {
    nomeExibicao: payload.nome,
    entradaBrutaId: entrada.id,
  });
  await definirEstagioInicialSeVazio(tx, pessoaId);

  await inserirEventoSeNaoExiste(tx, {
    pessoaId,
    tipo: "nota",
    ocorridoEm: entrada.recebidoEm,
    canal: "manual",
    usuarioId: payload.usuarioId ?? null,
    entradaBrutaId: entrada.id,
    // Sem texto, a nota marca o cadastro manual do lead ("Lead cadastrado manualmente").
    dados: { texto: payload.nota ?? null, lead_manual: true },
  });

  // Lead novo cadastrado à mão: o cadastro é o primeiro contato (cache das datas).
  if (criada) await registrarDataContato(tx, pessoaId, entrada.recebidoEm);
}
