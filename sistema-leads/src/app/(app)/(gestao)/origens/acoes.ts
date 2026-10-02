"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { z } from "zod";
import "@/lib/zod-ptbr";
import { db } from "@/db";
import { numeros, origens } from "@/db/schema";
import { camposDoFormulario, ehViolacaoUnica, primeiroErro, type EstadoAcao } from "@/lib/acoes";
import {
  MAX_TEXTO_PREENCHIDO,
  colunasDaOrigem,
  montarLinkWhatsapp,
  origemFormSchema,
} from "@/lib/origens";
import { exigirPapel } from "@/lib/sessao";
import { CODIGO_DESCONHECIDA, recalcularAtribuicao } from "@/nucleo/atribuicao";
import { casaPadrao, normalizarTexto } from "@/nucleo/normalizacao";

// Server Actions da tela Origens (só gestão). Toda entrada passa pelo zod e toda action
// confere o papel no servidor.

const CAMINHO = "/origens";

const idSchema = z.uuid({ error: "Origem inválida" });

/** Cria (sem `id`) ou edita (com `id`) uma origem. Ao criar, abre a página da origem. */
export async function salvarOrigem(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  await exigirPapel("gestao");
  const campos = camposDoFormulario(formData);
  const valores = { ...campos };
  const r = origemFormSchema.safeParse(campos);
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error), valores };
  const dados = colunasDaOrigem(r.data);
  const msgCodigoRepetido = `Já existe uma origem com o código "${dados.codigo}"`;

  if (!campos.id) {
    let novaId: string;
    try {
      const [nova] = await db
        .insert(origens)
        .values({ ...dados, criadaAutomaticamente: false })
        .returning({ id: origens.id });
      novaId = nova.id;
    } catch (erro) {
      if (ehViolacaoUnica(erro)) return { ok: false, mensagem: msgCodigoRepetido, valores };
      throw erro;
    }
    revalidatePath(CAMINHO);
    // O texto original (com acentos e emoji) não é gravado: vai na URL só para pré-preencher
    // o gerador do link logo depois de criar.
    const texto = r.data.texto_preenchido;
    redirect(`${CAMINHO}/${novaId}${texto ? `?texto=${encodeURIComponent(texto)}` : ""}`);
  }

  const id = idSchema.safeParse(campos.id);
  if (!id.success) return { ok: false, mensagem: "Origem inválida", valores };
  const [atual] = await db
    .select({ codigo: origens.codigo })
    .from(origens)
    .where(eq(origens.id, id.data));
  if (!atual) return { ok: false, mensagem: "Origem não encontrada", valores };
  // A origem "desconhecida" é o destino padrão do WhatsApp: o código não pode mudar.
  if (atual.codigo === CODIGO_DESCONHECIDA && dados.codigo !== CODIGO_DESCONHECIDA) {
    return {
      ok: false,
      mensagem: `O código "${CODIGO_DESCONHECIDA}" não pode ser alterado: é a origem padrão do WhatsApp`,
      valores,
    };
  }

  try {
    await db.update(origens).set(dados).where(eq(origens.id, id.data));
  } catch (erro) {
    if (ehViolacaoUnica(erro)) return { ok: false, mensagem: msgCodigoRepetido, valores };
    throw erro;
  }
  revalidatePath(CAMINHO);
  revalidatePath(`${CAMINHO}/${id.data}`);
  return {
    ok: true,
    mensagem: dados.padraoTexto
      ? `Origem salva. Padrão de texto gravado: "${dados.padraoTexto}".`
      : "Origem salva.",
  };
}

const ativoSchema = z.object({
  id: idSchema,
  ativo: z.enum(["true", "false"], { error: "Valor inválido" }).transform((v) => v === "true"),
});

export async function alterarAtivoOrigem(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  await exigirPapel("gestao");
  const r = ativoSchema.safeParse(camposDoFormulario(formData));
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error) };
  const alteradas = await db
    .update(origens)
    .set({ ativo: r.data.ativo })
    .where(eq(origens.id, r.data.id))
    .returning({ id: origens.id });
  if (alteradas.length === 0) return { ok: false, mensagem: "Origem não encontrada" };
  revalidatePath(CAMINHO);
  revalidatePath(`${CAMINHO}/${r.data.id}`);
  return { ok: true, mensagem: r.data.ativo ? "Origem ativada." : "Origem desativada." };
}

export async function recalcularPrimeiroToque(): Promise<EstadoAcao> {
  await exigirPapel("gestao");
  const { pessoasAtualizadas } = await recalcularAtribuicao();
  revalidatePath(CAMINHO);
  return {
    ok: true,
    mensagem:
      pessoasAtualizadas === 1
        ? "Primeiro toque recalculado: 1 pessoa atualizada."
        : `Primeiro toque recalculado: ${pessoasAtualizadas} pessoas atualizadas.`,
  };
}

export type EstadoLink = EstadoAcao & { linkWhatsapp?: string; svg?: string };

const linkSchema = z.object({
  origemId: idSchema,
  numero: z
    .string({ error: "Escolha o número" })
    .regex(/^\d{10,15}$/, "Escolha o número de destino"),
  texto: z
    .string()
    .max(MAX_TEXTO_PREENCHIDO, `Texto: no máximo ${MAX_TEXTO_PREENCHIDO} caracteres`)
    .optional()
    .transform((v) => v?.trim() ?? ""),
});

/**
 * Gera o link https://wa.me/{numero}?text={texto} e o QR Code (SVG) da origem. Nada é gravado:
 * o número e o texto valem só para este link. O texto precisa casar com o padrão da origem
 * (igual ou começando com ele, após normalizar), senão a mensagem não seria atribuída.
 */
export async function gerarLinkEQr(_estado: EstadoLink, formData: FormData): Promise<EstadoLink> {
  await exigirPapel("gestao");
  const campos = camposDoFormulario(formData);
  const valores = { numero: campos.numero ?? "", texto: campos.texto ?? "" };
  const r = linkSchema.safeParse(campos);
  if (!r.success) return { ok: false, mensagem: primeiroErro(r.error), valores };

  const [origem] = await db
    .select({ padraoTexto: origens.padraoTexto })
    .from(origens)
    .where(eq(origens.id, r.data.origemId));
  if (!origem) return { ok: false, mensagem: "Origem não encontrada", valores };
  const [numero] = await db
    .select({ numero: numeros.numero })
    .from(numeros)
    .where(eq(numeros.numero, r.data.numero));
  if (!numero) return { ok: false, mensagem: "Número não cadastrado", valores };

  const texto = r.data.texto || origem.padraoTexto || "";
  if (!normalizarTexto(texto)) {
    return { ok: false, mensagem: "Cadastre o texto pré-preenchido da origem primeiro", valores };
  }
  if (origem.padraoTexto && !casaPadrao(texto, origem.padraoTexto)) {
    return {
      ok: false,
      mensagem: `O texto precisa começar com o padrão desta origem ("${origem.padraoTexto}"), senão a conversa não será atribuída`,
      valores,
    };
  }

  const linkWhatsapp = montarLinkWhatsapp(numero.numero, texto);
  const svg = await QRCode.toString(linkWhatsapp, {
    type: "svg",
    margin: 2,
    errorCorrectionLevel: "M",
  });
  return { ok: true, mensagem: "Link e QR Code gerados.", valores, linkWhatsapp, svg };
}
