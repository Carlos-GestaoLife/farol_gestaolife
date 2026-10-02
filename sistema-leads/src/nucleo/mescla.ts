import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  estagios,
  eventos,
  filaRevisao,
  identificadores,
  mensagens,
  pessoas,
  vendas,
} from "@/db/schema";
import { atualizarPrimeiroToque } from "./atribuicao";
import { normalizarEmail, normalizarTelefone } from "./normalizacao";

// Mescla de pessoas (seção "Resolução de identidade" do CLAUDE.md): só pela tela, papel gestao.
// Move identificadores, eventos, mensagens e vendas da absorvida para a sobrevivente, ajusta o
// cache da sobrevivente, marca a absorvida com `mesclada_para_id` e grava o evento
// `identidade_mesclada`. NADA é apagado: a absorvida continua no banco e as consultas seguem
// `mesclada_para_id` até a sobrevivente.
//
// Exceção consciente à regra "eventos só recebe linhas novas": a mescla troca o `pessoa_id` dos
// eventos (é o que o CLAUDE.md manda: "move eventos"). O conteúdo de cada evento não muda, e o
// evento `identidade_mesclada` registra quem foi absorvido e quantos eventos foram movidos.

/** Erro de regra da mescla (mensagem pronta para a tela). */
export class ErroMescla extends Error {}

export type ParametrosMescla = {
  sobreviventeId: string;
  absorvidaId: string;
  /** Usuário (gestão) que fez a mescla. */
  usuarioId: string;
  /** Item da fila de revisão que motivou a mescla (fica resolvido). */
  filaRevisaoId?: string | null;
};

export type ResultadoMescla = {
  sobreviventeId: string;
  absorvidaId: string;
  /** Evento `identidade_mesclada` gravado (null quando as duas já eram a mesma pessoa). */
  eventoId: string | null;
  /** As duas já eram a mesma pessoa (mescladas antes): nada foi movido. */
  jaEramAMesma: boolean;
  identificadoresMovidos: number;
  eventosMovidos: number;
  mensagensMovidas: number;
  vendasMovidas: number;
  itensFilaResolvidos: number;
  /** Avisos para a tela (ex.: uma das pessoas já tinha sido mesclada antes). */
  avisos: string[];
};

type TipoEstagio = "aberto" | "ganho" | "perdido";
export type EstagioMescla = { id: string; ordem: number; tipo: TipoEstagio };

/**
 * Estágio que fica depois da mescla (PURA): ganho vence; perdido só se as duas forem perdidas;
 * fora isso, o de maior ordem entre os não perdidos. Sem estágio conta como `inicial`.
 */
export function escolherEstagioMescla(
  a: EstagioMescla | null,
  b: EstagioMescla | null,
  inicial: EstagioMescla | null,
): EstagioMescla | null {
  const ea = a ?? inicial;
  const eb = b ?? inicial;
  const candidatos = [ea, eb].filter((e): e is EstagioMescla => e !== null);
  if (candidatos.length === 0) return null;
  const maior = (lista: EstagioMescla[]) =>
    lista.reduce((x, y) => (y.ordem > x.ordem ? y : x));
  const ganhos = candidatos.filter((e) => e.tipo === "ganho");
  if (ganhos.length > 0) return maior(ganhos);
  const naoPerdidos = candidatos.filter((e) => e.tipo !== "perdido");
  if (naoPerdidos.length > 0) return maior(naoPerdidos);
  return ea ?? eb;
}

const LIMITE_CADEIA = 20;

/** Segue `mesclada_para_id` até a sobrevivente. Lança se a pessoa não existir. */
async function seguirMescla(tx: Tx, pessoaId: string): Promise<string> {
  let atual = pessoaId;
  const visitadas = new Set<string>();
  for (let i = 0; i < LIMITE_CADEIA; i++) {
    const [linha] = await tx
      .select({ mescladaParaId: pessoas.mescladaParaId })
      .from(pessoas)
      .where(eq(pessoas.id, atual));
    if (!linha) throw new ErroMescla("Pessoa não encontrada");
    visitadas.add(atual);
    if (!linha.mescladaParaId || visitadas.has(linha.mescladaParaId)) return atual;
    atual = linha.mescladaParaId;
  }
  throw new ErroMescla("Cadeia de mescla longa demais");
}

/** Resolve itens da fila (status resolvida, quem e quando). Devolve quantos mudaram. */
async function resolverItens(tx: Tx, ids: string[], usuarioId: string, agora: Date): Promise<number> {
  if (ids.length === 0) return 0;
  const r = await tx
    .update(filaRevisao)
    .set({ status: "resolvida", resolvidoPor: usuarioId, resolvidoEm: agora })
    .where(and(inArray(filaRevisao.id, ids), eq(filaRevisao.status, "aberta")))
    .returning({ id: filaRevisao.id });
  return r.length;
}

/**
 * Mescla a pessoa `absorvidaId` na `sobreviventeId`, dentro da transação `tx` (quem chama abre a
 * transação). Regras:
 * - não mescla uma pessoa com ela mesma;
 * - se uma das duas já foi mesclada, segue para a sobrevivente dela e devolve um aviso; se as
 *   duas já são a mesma pessoa, não move nada, resolve o item da fila e devolve `jaEramAMesma`;
 * - move identificadores, eventos, mensagens e vendas; itens abertos da fila de revisão que
 *   apontavam para a absorvida passam a apontar para a sobrevivente, e os que viram um par da
 *   mesma pessoa (ou repetem um par já aberto) são resolvidos;
 * - na sobrevivente: nome e responsável (os dela, senão os da absorvida), estágio
 *   (`escolherEstagioMescla`), primeiro toque recalculado, primeiro contato = mínimo, último
 *   contato = máximo, opt-out = OU;
 * - marca a absorvida (`mesclada_para_id`, `mesclada_em`) e grava `identidade_mesclada`.
 */
export async function mesclarPessoas(tx: Tx, params: ParametrosMescla): Promise<ResultadoMescla> {
  const { usuarioId } = params;
  const filaRevisaoId = params.filaRevisaoId ?? null;
  const avisos: string[] = [];
  const agora = new Date();

  if (params.sobreviventeId === params.absorvidaId) {
    throw new ErroMescla("Não é possível mesclar uma pessoa com ela mesma");
  }

  // Trava as duas linhas em ordem fixa (sem deadlock entre mesclas simultâneas).
  const ordenados = [params.sobreviventeId, params.absorvidaId].sort();
  await tx
    .select({ id: pessoas.id })
    .from(pessoas)
    .where(inArray(pessoas.id, ordenados))
    .orderBy(asc(pessoas.id))
    .for("update");

  const sobreviventeId = await seguirMescla(tx, params.sobreviventeId);
  const absorvidaId = await seguirMescla(tx, params.absorvidaId);
  if (sobreviventeId !== params.sobreviventeId) {
    avisos.push("A pessoa escolhida para ficar já tinha sido mesclada; a mescla foi feita na sobrevivente dela.");
  }
  if (absorvidaId !== params.absorvidaId) {
    avisos.push("A pessoa a absorver já tinha sido mesclada; foi usada a sobrevivente dela.");
  }
  if (sobreviventeId === absorvidaId) {
    // Nada a mover; o item da fila (se houver) deixa de fazer sentido e é resolvido.
    avisos.push("As duas pessoas já eram a mesma (mescladas antes); nada foi movido.");
    const itensFilaResolvidos = await resolverItens(tx, filaRevisaoId ? [filaRevisaoId] : [], usuarioId, agora);
    return {
      sobreviventeId,
      absorvidaId,
      eventoId: null,
      jaEramAMesma: true,
      identificadoresMovidos: 0,
      eventosMovidos: 0,
      mensagensMovidas: 0,
      vendasMovidas: 0,
      itensFilaResolvidos,
      avisos,
    };
  }
  if (sobreviventeId !== params.sobreviventeId || absorvidaId !== params.absorvidaId) {
    await tx
      .select({ id: pessoas.id })
      .from(pessoas)
      .where(inArray(pessoas.id, [sobreviventeId, absorvidaId].sort()))
      .orderBy(asc(pessoas.id))
      .for("update");
  }

  const duas = await tx
    .select({
      id: pessoas.id,
      nome: pessoas.nomeExibicao,
      estagioId: pessoas.estagioId,
      responsavelId: pessoas.responsavelId,
      primeiroContatoEm: pessoas.primeiroContatoEm,
      ultimoContatoEm: pessoas.ultimoContatoEm,
      motivoPerda: pessoas.motivoPerda,
      optOut: pessoas.optOut,
    })
    .from(pessoas)
    .where(inArray(pessoas.id, [sobreviventeId, absorvidaId]));
  const sob = duas.find((p) => p.id === sobreviventeId);
  const abs = duas.find((p) => p.id === absorvidaId);
  if (!sob || !abs) throw new ErroMescla("Pessoa não encontrada");

  // Move tudo da absorvida para a sobrevivente.
  // identificadores: UNIQUE(tipo, valor) é global, então mudar o dono nunca conflita.
  const idsMovidos = await tx
    .update(identificadores)
    .set({ pessoaId: sobreviventeId })
    .where(eq(identificadores.pessoaId, absorvidaId))
    .returning({ id: identificadores.id });
  const eventosMovidos = await tx
    .update(eventos)
    .set({ pessoaId: sobreviventeId })
    .where(eq(eventos.pessoaId, absorvidaId))
    .returning({ id: eventos.id });
  // mensagens: UNIQUE(numero_monitorado, wa_msg_id) não envolve a pessoa, então trocar o
  // `pessoa_id` nunca viola a unicidade (a mesma mensagem não existe nas duas pessoas).
  const mensagensMovidas = await tx
    .update(mensagens)
    .set({ pessoaId: sobreviventeId })
    .where(eq(mensagens.pessoaId, absorvidaId))
    .returning({ id: mensagens.id });
  const vendasMovidas = await tx
    .update(vendas)
    .set({ pessoaId: sobreviventeId })
    .where(eq(vendas.pessoaId, absorvidaId))
    .returning({ id: vendas.id });

  // Quem já tinha sido mesclado na absorvida passa a apontar direto para a sobrevivente.
  await tx
    .update(pessoas)
    .set({ mescladaParaId: sobreviventeId, atualizadoEm: agora })
    .where(eq(pessoas.mescladaParaId, absorvidaId));

  // Fila de revisão: itens abertos da absorvida passam para a sobrevivente.
  await tx
    .update(filaRevisao)
    .set({ pessoaAId: sobreviventeId })
    .where(and(eq(filaRevisao.status, "aberta"), eq(filaRevisao.pessoaAId, absorvidaId)));
  await tx
    .update(filaRevisao)
    .set({ pessoaBId: sobreviventeId })
    .where(and(eq(filaRevisao.status, "aberta"), eq(filaRevisao.pessoaBId, absorvidaId)));
  const abertos = await tx
    .select({ id: filaRevisao.id, a: filaRevisao.pessoaAId, b: filaRevisao.pessoaBId })
    .from(filaRevisao)
    .where(
      and(
        eq(filaRevisao.status, "aberta"),
        or(eq(filaRevisao.pessoaAId, sobreviventeId), eq(filaRevisao.pessoaBId, sobreviventeId)),
      ),
    )
    .orderBy(asc(filaRevisao.criadoEm), asc(filaRevisao.id));
  const paraResolver = new Set<string>();
  if (filaRevisaoId) paraResolver.add(filaRevisaoId);
  const paresVistos = new Set<string>();
  for (const item of abertos) {
    if (item.a === item.b) {
      paraResolver.add(item.id);
      continue;
    }
    const par = [item.a, item.b].sort().join(":");
    if (paresVistos.has(par)) paraResolver.add(item.id);
    paresVistos.add(par);
  }
  const itensFilaResolvidos = await resolverItens(tx, [...paraResolver], usuarioId, agora);

  // Estágio que fica.
  const lista = await tx
    .select({ id: estagios.id, ordem: estagios.ordem, tipo: estagios.tipo, nome: estagios.nome })
    .from(estagios)
    .orderBy(asc(estagios.ordem), asc(estagios.nome));
  const porId = new Map(lista.map((e) => [e.id, e]));
  const estagioFinal = escolherEstagioMescla(
    sob.estagioId ? (porId.get(sob.estagioId) ?? null) : null,
    abs.estagioId ? (porId.get(abs.estagioId) ?? null) : null,
    lista[0] ?? null,
  );
  const estagioFinalId = estagioFinal?.id ?? null;
  let motivoPerda: string | null = null;
  if (estagioFinal?.tipo === "perdido") {
    motivoPerda =
      estagioFinalId === sob.estagioId ? (sob.motivoPerda ?? abs.motivoPerda) : (abs.motivoPerda ?? sob.motivoPerda);
  }

  const datas = (a: Date | null, b: Date | null, fn: (x: number, y: number) => number) =>
    a && b ? new Date(fn(a.getTime(), b.getTime())) : (a ?? b);

  await tx
    .update(pessoas)
    .set({
      nomeExibicao: sob.nome?.trim() ? sob.nome : abs.nome,
      responsavelId: sob.responsavelId ?? abs.responsavelId,
      estagioId: estagioFinalId,
      motivoPerda,
      primeiroContatoEm: datas(sob.primeiroContatoEm, abs.primeiroContatoEm, Math.min),
      ultimoContatoEm: datas(sob.ultimoContatoEm, abs.ultimoContatoEm, Math.max),
      optOut: sob.optOut || abs.optOut,
      atualizadoEm: agora,
    })
    .where(eq(pessoas.id, sobreviventeId));
  // Primeiro toque recalculado com os eventos das duas.
  await atualizarPrimeiroToque(tx, sobreviventeId);

  // Marca a absorvida (nada é apagado).
  await tx
    .update(pessoas)
    .set({ mescladaParaId: sobreviventeId, mescladaEm: agora, atualizadoEm: agora })
    .where(eq(pessoas.id, absorvidaId));

  const [evento] = await tx
    .insert(eventos)
    .values({
      pessoaId: sobreviventeId,
      tipo: "identidade_mesclada",
      ocorridoEm: agora,
      canal: "manual",
      usuarioId,
      entradaBrutaId: null,
      dados: {
        absorvida_id: absorvidaId,
        absorvida_nome: abs.nome,
        identificadores_movidos: idsMovidos.length,
        eventos_movidos: eventosMovidos.length,
        mensagens_movidas: mensagensMovidas.length,
        vendas_movidas: vendasMovidas.length,
        estagio_antes: sob.estagioId,
        estagio_depois: estagioFinalId,
        fila_revisao_id: filaRevisaoId,
      },
    })
    .returning({ id: eventos.id });

  return {
    sobreviventeId,
    absorvidaId,
    eventoId: evento.id,
    jaEramAMesma: false,
    identificadoresMovidos: idsMovidos.length,
    eventosMovidos: eventosMovidos.length,
    mensagensMovidas: mensagensMovidas.length,
    vendasMovidas: vendasMovidas.length,
    itensFilaResolvidos,
    avisos,
  };
}

/** Resultado de uma mescla pela tela (mensagem pronta e link para a sobrevivente). */
export type ResultadoMesclaTela = { ok: boolean; mensagem: string; link?: string };

/**
 * Executa `mesclarPessoas` numa transação própria e devolve a mensagem para a tela. Erros de
 * regra (`ErroMescla`) viram mensagem; outros erros sobem.
 */
export async function executarMescla(params: ParametrosMescla): Promise<ResultadoMesclaTela> {
  try {
    const r = await db.transaction((tx) => mesclarPessoas(tx, params));
    const avisos = r.avisos.length > 0 ? ` ${r.avisos.join(" ")}` : "";
    if (r.jaEramAMesma) {
      return { ok: true, mensagem: `Nada a mesclar.${avisos}`, link: `/pessoas/${r.sobreviventeId}` };
    }
    console.info(
      `Mescla: pessoa ${r.absorvidaId} absorvida por ${r.sobreviventeId} (usuário ${params.usuarioId})`,
    );
    return {
      ok: true,
      mensagem:
        `Pessoas mescladas: ${r.identificadoresMovidos} identificadores, ${r.eventosMovidos} eventos e ` +
        `${r.mensagensMovidas} mensagens movidos.${avisos}`,
      link: `/pessoas/${r.sobreviventeId}`,
    };
  } catch (erro) {
    if (erro instanceof ErroMescla) return { ok: false, mensagem: erro.message };
    throw erro;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Encontra uma pessoa (já seguindo `mesclada_para_id`) por id, telefone (qualquer formato,
 * comparado pela forma canônica) ou e-mail. Null se não achar.
 */
export async function encontrarPessoaPorReferencia(referencia: string): Promise<string | null> {
  const ref = referencia.trim();
  if (!ref) return null;
  let pessoaId: string | null = null;
  if (UUID.test(ref)) {
    const [p] = await db.select({ id: pessoas.id }).from(pessoas).where(eq(pessoas.id, ref.toLowerCase()));
    pessoaId = p?.id ?? null;
  } else {
    const email = ref.includes("@") ? normalizarEmail(ref) : null;
    const telefone = email ? null : normalizarTelefone(ref);
    const tipo = email ? "email" : "telefone";
    const valor = email ?? telefone;
    if (!valor) return null;
    const [i] = await db
      .select({ pessoaId: identificadores.pessoaId })
      .from(identificadores)
      .where(and(eq(identificadores.tipo, tipo), eq(identificadores.valor, valor)));
    pessoaId = i?.pessoaId ?? null;
  }
  if (!pessoaId) return null;
  return db.transaction((tx) => seguirMescla(tx, pessoaId));
}
