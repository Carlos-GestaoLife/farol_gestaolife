"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import "@/lib/zod-ptbr";
import { camposDoFormulario, primeiroErro, type EstadoAcao } from "@/lib/acoes";
import { exigirSessao } from "@/lib/sessao";
import {
  MAX_MOTIVO_PERDA,
  MAX_NOME,
  MAX_NOTA,
  adicionarNotaManual,
  alterarNomeManual,
  alterarOptOutManual,
  alterarResponsavelManual,
  moverEstagioManual,
  type ResultadoAcaoPessoa,
} from "@/nucleo/pessoa-manual";

// Server Actions sobre uma pessoa, usadas pelo Kanban e pela tela Pessoa (gestão e comercial).
// Toda action exige sessão e valida a entrada com zod; a regra fica em src/nucleo/pessoa-manual.ts.

const idSchema = z.uuid({ error: "Identificador inválido" });

function revalidar(pessoaId: string) {
  revalidatePath("/kanban");
  revalidatePath("/leads");
  revalidatePath(`/pessoas/${pessoaId}`);
}

function resposta(r: ResultadoAcaoPessoa, sucesso: string, semMudanca: string): EstadoAcao {
  if (!r.ok) return { ok: false, mensagem: r.erro };
  return { ok: true, mensagem: r.alterado ? sucesso : semMudanca };
}

const moverSchema = z.object({
  pessoaId: idSchema,
  estagioId: idSchema,
  motivoPerda: z
    .string()
    .trim()
    .max(MAX_MOTIVO_PERDA, `O motivo deve ter no máximo ${MAX_MOTIVO_PERDA} caracteres`)
    .nullish(),
});

/** Move a pessoa para outro estágio (qualquer um). Perdido exige motivo. */
export async function moverEstagio(
  pessoaId: string,
  estagioId: string,
  motivoPerda?: string | null,
): Promise<EstadoAcao> {
  const sessao = await exigirSessao();
  const r = moverSchema.safeParse({ pessoaId, estagioId, motivoPerda });
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error) };
  const resultado = await moverEstagioManual({ ...r.data, usuarioId: sessao.user.id });
  if (resultado.ok) revalidar(r.data.pessoaId);
  return resposta(resultado, "Estágio alterado.", "A pessoa já estava neste estágio.");
}

const responsavelSchema = z.object({
  pessoaId: idSchema,
  responsavelId: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => v || null),
});

/** Troca o responsável (string vazia ou null tira o responsável). */
export async function alterarResponsavel(
  pessoaId: string,
  responsavelId: string | null,
): Promise<EstadoAcao> {
  const sessao = await exigirSessao();
  const r = responsavelSchema.safeParse({ pessoaId, responsavelId });
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error) };
  const resultado = await alterarResponsavelManual({ ...r.data, usuarioId: sessao.user.id });
  if (resultado.ok) revalidar(r.data.pessoaId);
  return resposta(resultado, "Responsável alterado.", "Nada mudou.");
}

const optOutSchema = z.object({ pessoaId: idSchema, optOut: z.boolean() });

/** Liga ou desliga o opt-out (grava uma nota). */
export async function alterarOptOut(pessoaId: string, optOut: boolean): Promise<EstadoAcao> {
  const sessao = await exigirSessao();
  const r = optOutSchema.safeParse({ pessoaId, optOut });
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error) };
  const resultado = await alterarOptOutManual({ ...r.data, usuarioId: sessao.user.id });
  if (resultado.ok) revalidar(r.data.pessoaId);
  return resposta(
    resultado,
    optOut ? "Opt-out ativado." : "Opt-out desativado.",
    "Nada mudou.",
  );
}

const notaSchema = z.object({
  pessoaId: idSchema,
  texto: z
    .string({ error: "Escreva a nota" })
    .trim()
    .min(1, "Escreva a nota")
    .max(MAX_NOTA, `A nota deve ter no máximo ${MAX_NOTA} caracteres`),
});

/** Formulário de nota (useActionState). */
export async function adicionarNota(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirSessao();
  const campos = camposDoFormulario(formData);
  const r = notaSchema.safeParse(campos);
  if (!r.success) {
    return { ok: false, mensagem: primeiroErro(r.error), valores: { texto: campos.texto ?? "" } };
  }
  const resultado = await adicionarNotaManual({ ...r.data, usuarioId: sessao.user.id });
  if (resultado.ok) revalidar(r.data.pessoaId);
  return resposta(resultado, "Nota adicionada.", "Nota adicionada.");
}

const nomeSchema = z.object({
  pessoaId: idSchema,
  nome: z.string().trim().max(MAX_NOME, `Use no máximo ${MAX_NOME} caracteres`).optional(),
});

/** Formulário do nome de exibição (useActionState). */
export async function alterarNome(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirSessao();
  const r = nomeSchema.safeParse(camposDoFormulario(formData));
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error) };
  const resultado = await alterarNomeManual({
    pessoaId: r.data.pessoaId,
    nome: r.data.nome ?? null,
    usuarioId: sessao.user.id,
  });
  if (resultado.ok) revalidar(r.data.pessoaId);
  return resposta(resultado, "Nome salvo.", "Nada mudou.");
}
