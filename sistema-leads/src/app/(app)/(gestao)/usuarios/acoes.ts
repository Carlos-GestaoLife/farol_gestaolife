"use server";

import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import "@/lib/zod-ptbr";
import { db } from "@/db";
import { account, numeros, papelNumero, session, user } from "@/db/schema";
import { camposDoFormulario, ehViolacaoUnica, primeiroErro, type EstadoAcao } from "@/lib/acoes";
import { PAPEIS } from "@/lib/papeis";
import { exigirPapel } from "@/lib/sessao";
import { normalizarTelefone } from "@/nucleo/normalizacao";

// Server Actions da tela "Usuários e números" (só gestão). Toda entrada passa pelo zod e
// toda action confere o papel no servidor, independentemente do que a tela mostra.

const CAMINHO = "/usuarios";

const senhaSchema = z
  .string({ error: "Informe a senha" })
  .min(8, "A senha deve ter pelo menos 8 caracteres")
  .max(128, "A senha deve ter no máximo 128 caracteres");

const novoUsuarioSchema = z.object({
  nome: z
    .string({ error: "Informe o nome" })
    .trim()
    .min(1, "Informe o nome")
    .max(120, "Nome longo demais"),
  email: z
    .string({ error: "Informe o e-mail" })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "E-mail inválido" })),
  papel: z.enum(PAPEIS, { error: "Escolha um papel válido" }),
  senha: senhaSchema,
});

export async function criarUsuario(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  await exigirPapel("gestao");
  const campos = camposDoFormulario(formData);
  const valores = { nome: campos.nome ?? "", email: campos.email ?? "", papel: campos.papel ?? "" };
  const r = novoUsuarioSchema.safeParse(campos);
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error), valores };
  const dados = r.data;

  const [existente] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, dados.email))
    .limit(1);
  if (existente) return { ok: false, mensagem: "Já existe um usuário com este e-mail", valores };

  const senhaHash = await hashPassword(dados.senha);
  const userId = randomUUID();
  const agora = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name: dados.nome,
        email: dados.email,
        emailVerified: true,
        papel: dados.papel,
        createdAt: agora,
        updatedAt: agora,
      });
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: senhaHash,
        createdAt: agora,
        updatedAt: agora,
      });
    });
  } catch (erro) {
    if (ehViolacaoUnica(erro))
      return { ok: false, mensagem: "Já existe um usuário com este e-mail", valores };
    throw erro;
  }

  revalidatePath(CAMINHO);
  return { ok: true, mensagem: `Usuário ${dados.email} criado.` };
}

const redefinirSenhaSchema = z.object({
  usuarioId: z.string().min(1, "Usuário não informado"),
  senha: senhaSchema,
});

export async function redefinirSenha(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirPapel("gestao");
  const r = redefinirSenhaSchema.safeParse(camposDoFormulario(formData));
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error) };
  const { usuarioId, senha } = r.data;

  const [alvo] = await db.select({ id: user.id }).from(user).where(eq(user.id, usuarioId)).limit(1);
  if (!alvo) return { ok: false, mensagem: "Usuário não encontrado" };

  const senhaHash = await hashPassword(senha);
  const agora = new Date();
  await db.transaction(async (tx) => {
    const atualizadas = await tx
      .update(account)
      .set({ password: senhaHash, updatedAt: agora })
      .where(and(eq(account.userId, usuarioId), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    if (atualizadas.length === 0) {
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: usuarioId,
        providerId: "credential",
        userId: usuarioId,
        password: senhaHash,
        createdAt: agora,
        updatedAt: agora,
      });
    }
    // Senha redefinida pela gestão: as sessões abertas do usuário caem (exceto a de quem redefiniu).
    if (usuarioId !== sessao.user.id) {
      await tx.delete(session).where(eq(session.userId, usuarioId));
    }
  });

  return { ok: true, mensagem: "Senha redefinida." };
}

const alterarPapelSchema = z.object({
  usuarioId: z.string().min(1, "Usuário não informado"),
  papel: z.enum(PAPEIS, { error: "Escolha um papel válido" }),
});

export async function alterarPapel(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirPapel("gestao");
  const r = alterarPapelSchema.safeParse(camposDoFormulario(formData));
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error) };
  const { usuarioId, papel } = r.data;

  // Evita que a gestão se tranque fora do sistema.
  if (usuarioId === sessao.user.id) {
    return { ok: false, mensagem: "Você não pode alterar o seu próprio papel" };
  }

  const atualizados = await db
    .update(user)
    .set({ papel, updatedAt: new Date() })
    .where(eq(user.id, usuarioId))
    .returning({ id: user.id });
  if (atualizados.length === 0) return { ok: false, mensagem: "Usuário não encontrado" };

  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Papel alterado. Vale em até 5 minutos para sessões abertas." };
}

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

const papelNumeroOpcional = z
  .union([z.enum(papelNumero.enumValues), z.literal("")], { error: "Papel do número inválido" })
  .optional()
  .transform((v) => (v ? v : null));

const usuarioOpcional = z
  .string()
  .optional()
  .transform((v) => (v ? v : null));

const numeroSchema = z.object({
  apelido: opcional(80),
  papel: papelNumeroOpcional,
  usuarioId: usuarioOpcional,
});

async function usuarioExiste(id: string | null): Promise<boolean> {
  if (!id) return true;
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.id, id)).limit(1);
  return Boolean(u);
}

export async function adicionarNumero(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  await exigirPapel("gestao");
  const campos = camposDoFormulario(formData);
  const valores = {
    telefone: campos.telefone ?? "",
    apelido: campos.apelido ?? "",
    papel: campos.papel ?? "",
    usuarioId: campos.usuarioId ?? "",
  };
  const r = numeroSchema
    .extend({ telefone: z.string({ error: "Informe o telefone" }) })
    .safeParse(campos);
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error), valores };

  const numero = normalizarTelefone(r.data.telefone);
  if (!numero)
    return {
      ok: false,
      mensagem: "Telefone inválido. Use DDD e número, ex.: 62 99999-8888",
      valores,
    };
  if (!(await usuarioExiste(r.data.usuarioId))) {
    return { ok: false, mensagem: "Usuário não encontrado", valores };
  }

  const inseridos = await db
    .insert(numeros)
    .values({ numero, apelido: r.data.apelido, papel: r.data.papel, usuarioId: r.data.usuarioId })
    .onConflictDoNothing({ target: numeros.numero })
    .returning({ numero: numeros.numero });
  if (inseridos.length === 0) {
    return { ok: false, mensagem: `O número ${numero} já está cadastrado`, valores };
  }

  revalidatePath(CAMINHO);
  return { ok: true, mensagem: `Número ${numero} adicionado.` };
}

export async function editarNumero(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  await exigirPapel("gestao");
  const r = numeroSchema
    .extend({ numero: z.string().regex(/^\d{10,15}$/, "Número inválido") })
    .safeParse(camposDoFormulario(formData));
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error) };
  if (!(await usuarioExiste(r.data.usuarioId)))
    return { ok: false, mensagem: "Usuário não encontrado" };

  const atualizados = await db
    .update(numeros)
    .set({ apelido: r.data.apelido, papel: r.data.papel, usuarioId: r.data.usuarioId })
    .where(eq(numeros.numero, r.data.numero))
    .returning({ numero: numeros.numero });
  if (atualizados.length === 0) return { ok: false, mensagem: "Número não encontrado" };

  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Número salvo." };
}
