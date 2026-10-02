"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import "@/lib/zod-ptbr";
import { db } from "@/db";
import { eventos } from "@/db/schema";
import { camposDoFormulario, primeiroErro, type EstadoAcao } from "@/lib/acoes";
import { exigirSessao } from "@/lib/sessao";
import { processarEntrada, registrarEntradas } from "@/nucleo/entradas";
import { normalizarEmail, normalizarTelefone } from "@/nucleo/normalizacao";

// Botão "Novo lead": passa pelo MESMO pipeline das outras fontes. Grava a entrada crua em
// `entradas_brutas` (fonte `manual`, chave `manual:{uuid}`) e processa na hora. Se o
// processamento falhar, a entrada fica com erro para o reprocessamento (nada se perde).

const opcional = (max: number, mensagem: string) =>
  z
    .string()
    .trim()
    .max(max, mensagem)
    .optional()
    .transform((v) => v || null);

const novoLeadSchema = z
  .object({
    nome: opcional(120, "Nome longo demais"),
    telefone: opcional(40, "Telefone longo demais"),
    email: opcional(200, "E-mail longo demais"),
    nota: opcional(2000, "A nota deve ter no máximo 2000 caracteres"),
  })
  .refine((d) => d.telefone || d.email, { message: "Informe o telefone ou o e-mail" })
  .refine((d) => !d.telefone || normalizarTelefone(d.telefone), {
    message: "Telefone inválido. Use DDD e número, ex.: 62 99999-8888",
  })
  .refine((d) => !d.email || normalizarEmail(d.email), { message: "E-mail inválido" });

export async function criarLead(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirSessao();
  const campos = camposDoFormulario(formData);
  const valores = {
    nome: campos.nome ?? "",
    telefone: campos.telefone ?? "",
    email: campos.email ?? "",
    nota: campos.nota ?? "",
  };
  const r = novoLeadSchema.safeParse(campos);
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error), valores };

  const {
    aceitas: [entrada],
  } = await registrarEntradas([
    {
      fonte: "manual",
      chaveIdempotencia: `manual:${randomUUID()}`,
      payload: { ...r.data, usuarioId: sessao.user.id },
    },
  ]);
  const resultado = await processarEntrada(entrada.id);
  if (resultado.status === "erro") {
    return {
      ok: false,
      mensagem: `O lead foi registrado, mas o processamento falhou (${resultado.erro}). A entrada fica para reprocessamento.`,
      valores,
    };
  }

  const [evento] = await db
    .select({ pessoaId: eventos.pessoaId })
    .from(eventos)
    .where(eq(eventos.entradaBrutaId, entrada.id))
    .limit(1);

  revalidatePath("/leads");
  revalidatePath("/kanban");
  return {
    ok: true,
    mensagem: "Lead salvo. Se o telefone ou o e-mail já existiam, ele foi vinculado à mesma pessoa.",
    link: evento ? `/pessoas/${evento.pessoaId}` : undefined,
  };
}
