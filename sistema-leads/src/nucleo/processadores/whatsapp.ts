import { and, eq, gte, isNotNull, lte, min, ne, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { mensagens, origens, pessoas } from "@/db/schema";
import { atribuirOrigem } from "../atribuicao";
import { definirEstagioInicialSeVazio, moverEstagioAutomatico } from "../estagios";
import { inserirEventoSeNaoExiste } from "../eventos";
import { montarIdentificadores, resolverPessoa } from "../identidade";
import { normalizarTelefone } from "../normalizacao";
import { garantirNumero } from "../numeros";
import type { EntradaBruta } from "../registro";
import {
  JANELA_CONVERSA_DIAS,
  cortarTexto,
  deveManterTextoAbertura,
  payloadEntradaWhatsappSchema,
} from "../whatsapp";

// Processador da fonte `whatsapp`: uma mensagem (só metadados) capturada pelo piolho.
// Reexecutável: mensagem com ON CONFLICT DO NOTHING, eventos com inserirEventoSeNaoExiste,
// estágio só avança e as datas de contato usam min/max.
//
// Duas coisas diferentes acontecem numa conversa, e de propósito em momentos diferentes:
// - EVENTO `conversa_iniciada`: gravado na ABERTURA da conversa, isto é, na mensagem recebida
//   (`in`) sem nenhuma mensagem daquele chat nos 30 dias anteriores. É o toque que a
//   atribuição de origem (Etapa 8) usa.
// - ESTÁGIO "Em conversa" (gatilho `conversa_iniciada` no seed): muda na PRIMEIRA RESPOSTA,
//   isto é, na primeira mensagem enviada (`out`) depois de uma recebida (`in`) no chat. Lead
//   que só mandou mensagem e ainda não foi respondido continua em "Novo lead".

const DIA_MS = 24 * 60 * 60 * 1000;

async function padroesAtivos(tx: Tx): Promise<string[]> {
  const linhas = await tx
    .select({ padrao: origens.padraoTexto })
    .from(origens)
    .where(and(eq(origens.ativo, true), isNotNull(origens.padraoTexto)));
  return linhas.map((l) => l.padrao).filter((p): p is string => Boolean(p && p.trim()));
}

export async function processarWhatsapp(tx: Tx, entrada: EntradaBruta): Promise<void> {
  const p = payloadEntradaWhatsappSchema.parse(entrada.payload);

  const numero = normalizarTelefone(p.numero_monitorado);
  if (!numero) throw new Error(`Número monitorado inválido: ${p.numero_monitorado}`);
  // A rota já garante o número; aqui de novo para o reprocessamento não depender disso (FK).
  await garantirNumero(tx, numero);

  const lista = montarIdentificadores({ waId: p.contato.wa_id, telefone: p.contato.telefone });
  if (lista.length === 0) {
    throw new Error(
      `Contato sem identificador válido (wa_id ${p.contato.wa_id}, telefone ${p.contato.telefone ?? "ausente"})`,
    );
  }
  const { pessoaId } = await resolverPessoa(tx, lista, {
    nomeExibicao: p.contato.nome_agenda ?? p.contato.pushname,
    entradaBrutaId: entrada.id,
  });

  // Uma mensagem por vez em cada chat: a regra de abertura depende das mensagens anteriores.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`chat:${numero}:${p.chat_id}`}, 0))`,
  );

  const enviadaEm = new Date(p.enviada_em);
  const doChat = and(
    eq(mensagens.numeroMonitorado, numero),
    eq(mensagens.chatId, p.chat_id),
    ne(mensagens.waMsgId, p.wa_msg_id),
  );

  // Abre conversa: mensagem recebida sem nenhuma outra do chat nos 30 dias anteriores.
  let abreConversa = false;
  if (p.direcao === "in") {
    const inicioJanela = new Date(enviadaEm.getTime() - JANELA_CONVERSA_DIAS * DIA_MS);
    const [anterior] = await tx
      .select({ id: mensagens.id })
      .from(mensagens)
      .where(
        and(doChat, gte(mensagens.enviadaEm, inicioJanela), lte(mensagens.enviadaEm, enviadaEm)),
      )
      .limit(1);
    abreConversa = !anterior;
  }

  const padroes = p.texto_abertura ? await padroesAtivos(tx) : [];
  const textoAbertura =
    p.texto_abertura &&
    deveManterTextoAbertura({ direcao: p.direcao, abreConversa, texto: p.texto_abertura, padroes })
      ? cortarTexto(p.texto_abertura)
      : null;

  await tx
    .insert(mensagens)
    .values({
      pessoaId,
      numeroMonitorado: numero,
      waMsgId: p.wa_msg_id,
      chatId: p.chat_id,
      direcao: p.direcao,
      tipoMidia: p.tipo_midia,
      enviadaEm,
      textoAbertura,
      ctwa: p.ctwa,
      dispositivoId: p.dispositivo_id,
      entradaBrutaId: entrada.id,
    })
    .onConflictDoNothing({ target: [mensagens.numeroMonitorado, mensagens.waMsgId] });

  await definirEstagioInicialSeVazio(tx, pessoaId);

  if (abreConversa) {
    // Etapa 8: atribuirOrigem passa a devolver a origem (ctwa, padrão de texto ou desconhecida).
    const origemId = await atribuirOrigem(tx, {
      canal: "whatsapp",
      numeroMonitorado: numero,
      textoAbertura,
      ctwa: p.ctwa,
    });
    await inserirEventoSeNaoExiste(tx, {
      pessoaId,
      tipo: "conversa_iniciada",
      ocorridoEm: enviadaEm,
      canal: "whatsapp",
      origemId,
      numeroMonitorado: numero,
      entradaBrutaId: entrada.id,
      dados: { chat_id: p.chat_id, texto_abertura: textoAbertura, ctwa: p.ctwa },
    });
  }

  // Primeira resposta: um `out` depois de um `in` no chat move para "Em conversa".
  // As mensagens podem chegar fora de ordem (lotes de PCs diferentes ou fila atrasada), por
  // isso o par também é procurado quando chega o `in`: se já houver um `out` depois dele.
  let respostaEm: Date | null = null;
  if (p.direcao === "out") {
    const [recebida] = await tx
      .select({ id: mensagens.id })
      .from(mensagens)
      .where(and(doChat, eq(mensagens.direcao, "in"), lte(mensagens.enviadaEm, enviadaEm)))
      .limit(1);
    if (recebida) respostaEm = enviadaEm;
  } else {
    const [resposta] = await tx
      .select({ em: min(mensagens.enviadaEm) })
      .from(mensagens)
      .where(and(doChat, eq(mensagens.direcao, "out"), gte(mensagens.enviadaEm, enviadaEm)));
    respostaEm = resposta?.em ?? null;
  }
  if (respostaEm) {
    await moverEstagioAutomatico(tx, pessoaId, "conversa_iniciada", {
      canal: "whatsapp",
      ocorridoEm: respostaEm,
      entradaBrutaId: entrada.id,
      numeroMonitorado: numero,
    });
  }

  // Cache das datas de contato (derivado das mensagens; pode ser recalculado).
  const em = sql`${enviadaEm.toISOString()}::timestamptz`;
  await tx
    .update(pessoas)
    .set({
      primeiroContatoEm: sql`least(coalesce(${pessoas.primeiroContatoEm}, ${em}), ${em})`,
      ultimoContatoEm: sql`greatest(coalesce(${pessoas.ultimoContatoEm}, ${em}), ${em})`,
      atualizadoEm: new Date(),
    })
    .where(eq(pessoas.id, pessoaId));
}
