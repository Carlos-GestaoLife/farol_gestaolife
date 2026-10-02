import { asc, desc, eq } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { estagios, eventos, identificadores, mensagens, origens, pessoas, user } from "@/db/schema";
import {
  agregarMensagensPorDia,
  descreverDiaMensagens,
  descreverEvento,
  type DescricaoEvento,
  type DiaMensagens,
} from "@/lib/linha-do-tempo";

// Consultas da tela Pessoa: dados do cabeçalho, identificadores e linha do tempo
// (eventos intercalados com as mensagens agregadas por dia e por número monitorado).

export const LIMITE_ITENS_LINHA_DO_TEMPO = 500;
/** Mensagens lidas para a agregação (as mais recentes). Acima disso, a tela avisa. */
export const LIMITE_MENSAGENS = 10_000;
const LIMITE_CADEIA_MESCLA = 20;

export type PessoaDetalhe = {
  id: string;
  nome: string | null;
  estagioId: string | null;
  estagioNome: string | null;
  estagioTipo: "aberto" | "ganho" | "perdido" | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  origemNome: string | null;
  primeiroContatoEm: Date | null;
  ultimoContatoEm: Date | null;
  motivoPerda: string | null;
  optOut: boolean;
  criadoEm: Date;
};

export type ResultadoPessoa =
  | { tipo: "encontrada"; pessoa: PessoaDetalhe }
  | { tipo: "mesclada"; sobreviventeId: string }
  | { tipo: "nao_encontrada" };

/** Segue `mesclada_para_id` até a sobrevivente. Null se a pessoa não existir. */
export async function sobreviventeDe(pessoaId: string, executor: Executor = db): Promise<string | null> {
  let atual = pessoaId;
  const visitadas = new Set<string>();
  for (let i = 0; i < LIMITE_CADEIA_MESCLA; i++) {
    const [linha] = await executor
      .select({ mescladaParaId: pessoas.mescladaParaId })
      .from(pessoas)
      .where(eq(pessoas.id, atual));
    if (!linha) return i === 0 ? null : atual;
    visitadas.add(atual);
    if (!linha.mescladaParaId || visitadas.has(linha.mescladaParaId)) return atual;
    atual = linha.mescladaParaId;
  }
  return atual;
}

export async function carregarPessoa(id: string, executor: Executor = db): Promise<ResultadoPessoa> {
  const [p] = await executor
    .select({
      id: pessoas.id,
      nome: pessoas.nomeExibicao,
      estagioId: pessoas.estagioId,
      estagioNome: estagios.nome,
      estagioTipo: estagios.tipo,
      responsavelId: pessoas.responsavelId,
      responsavelNome: user.name,
      origemNome: origens.nome,
      primeiroContatoEm: pessoas.primeiroContatoEm,
      ultimoContatoEm: pessoas.ultimoContatoEm,
      motivoPerda: pessoas.motivoPerda,
      optOut: pessoas.optOut,
      criadoEm: pessoas.criadoEm,
      mescladaParaId: pessoas.mescladaParaId,
    })
    .from(pessoas)
    .leftJoin(estagios, eq(estagios.id, pessoas.estagioId))
    .leftJoin(origens, eq(origens.id, pessoas.origemPrimeiroToqueId))
    .leftJoin(user, eq(user.id, pessoas.responsavelId))
    .where(eq(pessoas.id, id));
  if (!p) return { tipo: "nao_encontrada" };
  if (p.mescladaParaId) {
    const sobrevivente = await sobreviventeDe(id, executor);
    if (sobrevivente && sobrevivente !== id) return { tipo: "mesclada", sobreviventeId: sobrevivente };
  }
  const { mescladaParaId: _ignorar, ...pessoa } = p;
  void _ignorar;
  return { tipo: "encontrada", pessoa };
}

export type IdentificadorLinha = {
  id: string;
  tipo: "telefone" | "email" | "wa_id" | "meta_lead_id";
  valor: string;
  valorOriginal: string | null;
  criadoEm: Date;
};

export async function listarIdentificadores(
  pessoaId: string,
  executor: Executor = db,
): Promise<IdentificadorLinha[]> {
  return executor
    .select({
      id: identificadores.id,
      tipo: identificadores.tipo,
      valor: identificadores.valor,
      valorOriginal: identificadores.valorOriginal,
      criadoEm: identificadores.criadoEm,
    })
    .from(identificadores)
    .where(eq(identificadores.pessoaId, pessoaId))
    .orderBy(asc(identificadores.tipo), asc(identificadores.criadoEm));
}

export type ItemLinhaDoTempo =
  | {
      tipo: "evento";
      id: string;
      em: Date;
      tipoEvento: string;
      descricao: DescricaoEvento;
    }
  | {
      tipo: "mensagens";
      id: string;
      em: Date;
      dia: DiaMensagens;
      resumo: string;
    };

export type LinhaDoTempo = {
  itens: ItemLinhaDoTempo[];
  /** Havia mais itens (ou mensagens) do que o limite: a tela mostra um aviso. */
  truncada: boolean;
};

/**
 * Linha do tempo da pessoa, mais recente primeiro: eventos (todos os tipos) intercalados com
 * as mensagens agregadas por dia e por número. Nunca traz conteúdo de mensagem além do
 * `texto_abertura`. Limitada a `LIMITE_ITENS_LINHA_DO_TEMPO` itens.
 */
export async function carregarLinhaDoTempo(
  pessoaId: string,
  executor: Executor = db,
): Promise<LinhaDoTempo> {
  const limite = LIMITE_ITENS_LINHA_DO_TEMPO;
  const linhasEventos = await executor
    .select({
      id: eventos.id,
      tipo: eventos.tipo,
      ocorridoEm: eventos.ocorridoEm,
      canal: eventos.canal,
      dados: eventos.dados,
      numeroMonitorado: eventos.numeroMonitorado,
      usuarioNome: user.name,
      origemNome: origens.nome,
    })
    .from(eventos)
    .leftJoin(user, eq(user.id, eventos.usuarioId))
    .leftJoin(origens, eq(origens.id, eventos.origemId))
    .where(eq(eventos.pessoaId, pessoaId))
    .orderBy(desc(eventos.ocorridoEm), desc(eventos.registradoEm))
    .limit(limite + 1);

  const linhasMensagens = await executor
    .select({
      numeroMonitorado: mensagens.numeroMonitorado,
      chatId: mensagens.chatId,
      direcao: mensagens.direcao,
      enviadaEm: mensagens.enviadaEm,
      textoAbertura: mensagens.textoAbertura,
    })
    .from(mensagens)
    .where(eq(mensagens.pessoaId, pessoaId))
    .orderBy(desc(mensagens.enviadaEm))
    .limit(LIMITE_MENSAGENS + 1);

  let truncada = linhasEventos.length > limite || linhasMensagens.length > LIMITE_MENSAGENS;

  const itens: ItemLinhaDoTempo[] = [
    ...linhasEventos.slice(0, limite).map(
      (e): ItemLinhaDoTempo => ({
        tipo: "evento",
        id: e.id,
        em: e.ocorridoEm,
        tipoEvento: e.tipo,
        descricao: descreverEvento(e),
      }),
    ),
    ...agregarMensagensPorDia(linhasMensagens.slice(0, LIMITE_MENSAGENS)).map(
      (dia): ItemLinhaDoTempo => ({
        tipo: "mensagens",
        id: `${dia.dia}:${dia.numeroMonitorado}`,
        em: dia.ultimaEm,
        dia,
        resumo: descreverDiaMensagens(dia),
      }),
    ),
  ].sort((a, b) => b.em.getTime() - a.em.getTime());

  if (itens.length > limite) {
    truncada = true;
    itens.length = limite;
  }
  return { itens, truncada };
}
