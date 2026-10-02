import { and, eq, isNull } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { estagios, eventos, pessoas, user } from "@/db/schema";

// Ações manuais sobre uma pessoa (telas Kanban e Pessoa). Cada ação é uma transação:
// UPDATE no cache em `pessoas` + INSERT do evento correspondente (canal `manual`, com o
// usuário e a hora). `eventos` só recebe linhas novas. As Server Actions validam a entrada
// com zod, exigem sessão e chamam estas funções.

export const MAX_MOTIVO_PERDA = 500;
export const MAX_NOTA = 2000;
export const MAX_NOME = 120;

export type ResultadoAcaoPessoa = { ok: true; alterado: boolean } | { ok: false; erro: string };

class ErroAcao extends Error {}

async function executar(fn: (tx: Tx) => Promise<boolean>): Promise<ResultadoAcaoPessoa> {
  try {
    const alterado = await db.transaction(fn);
    return { ok: true, alterado };
  } catch (erro) {
    if (erro instanceof ErroAcao) return { ok: false, erro: erro.message };
    throw erro;
  }
}

/** Trava a pessoa até o fim da transação. Pessoa mesclada não aceita ações. */
async function travarPessoa(tx: Tx, pessoaId: string) {
  const [pessoa] = await tx.select().from(pessoas).where(eq(pessoas.id, pessoaId)).for("update");
  if (!pessoa) throw new ErroAcao("Pessoa não encontrada");
  if (pessoa.mescladaParaId) throw new ErroAcao("Esta pessoa foi mesclada com outra; abra a ficha da sobrevivente");
  return pessoa;
}

async function registrarEventoManual(
  tx: Tx,
  pessoaId: string,
  usuarioId: string,
  tipo: "estagio_alterado" | "responsavel_alterado" | "nota",
  dados: Record<string, unknown>,
): Promise<void> {
  // Ação manual não tem entrada bruta: o evento é sempre inserido (sem checagem de duplicata).
  await tx.insert(eventos).values({
    pessoaId,
    tipo,
    ocorridoEm: new Date(),
    canal: "manual",
    usuarioId,
    entradaBrutaId: null,
    dados,
  });
}

/**
 * Move a pessoa para QUALQUER estágio (para frente ou para trás). Destino do tipo `perdido`
 * exige `motivoPerda`, gravado na pessoa e no evento; sair de um estágio perdido limpa o motivo.
 */
export async function moverEstagioManual(params: {
  pessoaId: string;
  estagioId: string;
  usuarioId: string;
  motivoPerda?: string | null;
}): Promise<ResultadoAcaoPessoa> {
  const motivo = params.motivoPerda?.trim() || null;
  return executar(async (tx) => {
    const pessoa = await travarPessoa(tx, params.pessoaId);
    const [destino] = await tx.select().from(estagios).where(eq(estagios.id, params.estagioId));
    if (!destino) throw new ErroAcao("Estágio não encontrado");
    if (destino.tipo === "perdido" && !motivo) throw new ErroAcao("Informe o motivo da perda");
    if (motivo && motivo.length > MAX_MOTIVO_PERDA) {
      throw new ErroAcao(`O motivo deve ter no máximo ${MAX_MOTIVO_PERDA} caracteres`);
    }

    const novoMotivo = destino.tipo === "perdido" ? motivo : null;
    if (pessoa.estagioId === destino.id && pessoa.motivoPerda === novoMotivo) return false;

    let atual: typeof estagios.$inferSelect | undefined;
    if (pessoa.estagioId) {
      [atual] = await tx.select().from(estagios).where(eq(estagios.id, pessoa.estagioId));
    }

    await tx
      .update(pessoas)
      .set({ estagioId: destino.id, motivoPerda: novoMotivo, atualizadoEm: new Date() })
      .where(eq(pessoas.id, params.pessoaId));

    await registrarEventoManual(tx, params.pessoaId, params.usuarioId, "estagio_alterado", {
      de: atual?.id ?? null,
      para: destino.id,
      de_nome: atual?.nome ?? null,
      para_nome: destino.nome,
      automatico: false,
      ...(novoMotivo ? { motivo_perda: novoMotivo } : {}),
    });
    return true;
  });
}

/** Troca o responsável (ou tira, com `responsavelId` null) e grava `responsavel_alterado`. */
export async function alterarResponsavelManual(params: {
  pessoaId: string;
  responsavelId: string | null;
  usuarioId: string;
}): Promise<ResultadoAcaoPessoa> {
  return executar(async (tx) => {
    const pessoa = await travarPessoa(tx, params.pessoaId);
    if (pessoa.responsavelId === params.responsavelId) return false;

    const nomeDe = async (id: string | null) => {
      if (!id) return null;
      const [u] = await tx.select({ nome: user.name }).from(user).where(eq(user.id, id));
      return u?.nome ?? null;
    };
    const paraNome = await nomeDe(params.responsavelId);
    if (params.responsavelId && paraNome === null) throw new ErroAcao("Usuário não encontrado");
    const deNome = await nomeDe(pessoa.responsavelId);

    await tx
      .update(pessoas)
      .set({ responsavelId: params.responsavelId, atualizadoEm: new Date() })
      .where(eq(pessoas.id, params.pessoaId));

    await registrarEventoManual(tx, params.pessoaId, params.usuarioId, "responsavel_alterado", {
      de: pessoa.responsavelId,
      para: params.responsavelId,
      de_nome: deNome,
      para_nome: paraNome,
    });
    return true;
  });
}

/** Grava uma nota (evento `nota`, dados { texto }). */
export async function adicionarNotaManual(params: {
  pessoaId: string;
  texto: string;
  usuarioId: string;
}): Promise<ResultadoAcaoPessoa> {
  const texto = params.texto.trim();
  if (!texto) return { ok: false, erro: "Escreva a nota" };
  if (texto.length > MAX_NOTA) return { ok: false, erro: `A nota deve ter no máximo ${MAX_NOTA} caracteres` };
  return executar(async (tx) => {
    await travarPessoa(tx, params.pessoaId);
    await registrarEventoManual(tx, params.pessoaId, params.usuarioId, "nota", { texto });
    return true;
  });
}

/** Liga ou desliga o opt-out e grava a nota "Opt-out ativado" ou "Opt-out desativado". */
export async function alterarOptOutManual(params: {
  pessoaId: string;
  optOut: boolean;
  usuarioId: string;
}): Promise<ResultadoAcaoPessoa> {
  return executar(async (tx) => {
    const pessoa = await travarPessoa(tx, params.pessoaId);
    if (pessoa.optOut === params.optOut) return false;
    await tx
      .update(pessoas)
      .set({ optOut: params.optOut, atualizadoEm: new Date() })
      .where(eq(pessoas.id, params.pessoaId));
    await registrarEventoManual(tx, params.pessoaId, params.usuarioId, "nota", {
      texto: params.optOut ? "Opt-out ativado" : "Opt-out desativado",
      opt_out: params.optOut,
    });
    return true;
  });
}

/** Troca o nome de exibição e grava uma nota com o nome anterior (o histórico fica nos eventos). */
export async function alterarNomeManual(params: {
  pessoaId: string;
  nome: string | null;
  usuarioId: string;
}): Promise<ResultadoAcaoPessoa> {
  const nome = params.nome?.trim() || null;
  if (nome && nome.length > MAX_NOME) return { ok: false, erro: `Use no máximo ${MAX_NOME} caracteres` };
  return executar(async (tx) => {
    const pessoa = await travarPessoa(tx, params.pessoaId);
    if ((pessoa.nomeExibicao ?? null) === nome) return false;
    await tx
      .update(pessoas)
      .set({ nomeExibicao: nome, atualizadoEm: new Date() })
      .where(and(eq(pessoas.id, params.pessoaId), isNull(pessoas.mescladaParaId)));
    await registrarEventoManual(tx, params.pessoaId, params.usuarioId, "nota", {
      texto: `Nome alterado de "${pessoa.nomeExibicao ?? "sem nome"}" para "${nome ?? "sem nome"}"`,
      nome_de: pessoa.nomeExibicao,
      nome_para: nome,
    });
    return true;
  });
}
