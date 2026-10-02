"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import "@/lib/zod-ptbr";
import { db } from "@/db";
import { dispositivos, user } from "@/db/schema";
import { camposDoFormulario, primeiroErro, type EstadoAcao } from "@/lib/acoes";
import { exigirPapel } from "@/lib/sessao";
import { gerarTokenDispositivo, hashToken } from "@/nucleo/dispositivos";

// Server Actions da tela Dispositivos (só gestão). O token só existe em claro aqui, na
// resposta da action, para ser mostrado UMA vez; no banco fica apenas o sha256.

const CAMINHO = "/dispositivos";

const novoDispositivoSchema = z.object({
  nome: z
    .string({ error: "Informe o nome" })
    .trim()
    .min(1, "Informe o nome")
    .max(80, "Nome longo demais"),
  usuarioId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function criarDispositivo(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  await exigirPapel("gestao");
  const campos = camposDoFormulario(formData);
  const valores = { nome: campos.nome ?? "", usuarioId: campos.usuarioId ?? "" };
  const r = novoDispositivoSchema.safeParse(campos);
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error), valores };

  if (r.data.usuarioId) {
    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, r.data.usuarioId))
      .limit(1);
    if (!u) return { ok: false, mensagem: "Usuário não encontrado", valores };
  }

  const token = gerarTokenDispositivo();
  await db.insert(dispositivos).values({
    nome: r.data.nome,
    usuarioId: r.data.usuarioId,
    tokenHash: hashToken(token),
  });

  revalidatePath(CAMINHO);
  return { ok: true, mensagem: `Dispositivo "${r.data.nome}" criado.`, token };
}

const idSchema = z.object({ id: z.uuid({ error: "Dispositivo inválido" }) });

export async function alternarAtivo(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  await exigirPapel("gestao");
  const r = idSchema
    .extend({ ativo: z.enum(["true", "false"], { error: "Valor inválido" }) })
    .safeParse(camposDoFormulario(formData));
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error) };
  const ativo = r.data.ativo === "true";

  const atualizados = await db
    .update(dispositivos)
    .set({ ativo })
    .where(eq(dispositivos.id, r.data.id))
    .returning({ id: dispositivos.id });
  if (atualizados.length === 0) return { ok: false, mensagem: "Dispositivo não encontrado" };

  revalidatePath(CAMINHO);
  return { ok: true, mensagem: ativo ? "Dispositivo reativado." : "Dispositivo desativado." };
}

export async function gerarNovoToken(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  await exigirPapel("gestao");
  const r = idSchema.safeParse(camposDoFormulario(formData));
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error) };

  // O token antigo deixa de valer na hora: o hash é substituído.
  const token = gerarTokenDispositivo();
  const atualizados = await db
    .update(dispositivos)
    .set({ tokenHash: hashToken(token) })
    .where(eq(dispositivos.id, r.data.id))
    .returning({ id: dispositivos.id });
  if (atualizados.length === 0) return { ok: false, mensagem: "Dispositivo não encontrado" };

  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Novo token gerado. O anterior não vale mais.", token };
}
