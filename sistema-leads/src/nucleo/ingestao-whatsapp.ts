import { and, eq, isNotNull, max } from "drizzle-orm";
import { db } from "@/db";
import { dispositivos, mensagens, origens } from "@/db/schema";
import type { Dispositivo } from "./dispositivos";
import { processarEntrada, registrarEntradas } from "./entradas";
import { normalizarTelefone } from "./normalizacao";
import { garantirNumero } from "./numeros";
import { descreverErrosZod, heartbeatSchema, validarLoteWhatsapp, type ErroItem } from "./whatsapp";

// Lógica das rotas POST /api/ingest/whatsapp e POST /api/ingest/heartbeat, separada do
// Next para poder ser testada direto (as rotas só autenticam, leem o JSON e respondem).
// Contrato na seção "API de ingestão" do CLAUDE.md do sistema-leads.

export type RespostaIngestao<T> =
  | { status: 200; corpo: T }
  | { status: 400; corpo: { erro: string } };

export type RespostaWhatsapp = { aceitos: string[]; erros: ErroItem[] };

/**
 * Recebe um lote do piolho. Aceito = gravado em `entradas_brutas` (regra "nada se perde");
 * duplicado também é aceito. O processamento roda logo em seguida, em ordem cronológica, mas
 * um erro nele NÃO tira o item de `aceitos`: a entrada fica com status `erro` e o
 * reprocessamento tenta de novo.
 */
export async function ingerirWhatsapp(
  dispositivo: Dispositivo,
  corpo: unknown,
): Promise<RespostaIngestao<RespostaWhatsapp>> {
  const lote = validarLoteWhatsapp(corpo);
  if (!lote.ok) return { status: 400, corpo: { erro: lote.erro } };

  const numero = normalizarTelefone(lote.numeroMonitorado);
  if (!numero)
    return { status: 400, corpo: { erro: "numero_monitorado não é um telefone válido" } };

  await garantirNumero(db, numero, dispositivo.usuarioId);
  await db
    .update(dispositivos)
    .set({
      numeroDetectado: numero,
      ultimoSinalEm: new Date(),
      versaoExtensao: lote.versaoExtensao,
    })
    .where(eq(dispositivos.id, dispositivo.id));

  if (lote.validos.length === 0) return { status: 200, corpo: { aceitos: [], erros: lote.erros } };

  const { aceitas } = await registrarEntradas(
    lote.validos.map((item) => ({
      fonte: "whatsapp" as const,
      chaveIdempotencia: `${numero}:${item.wa_msg_id}`,
      payload: {
        ...item,
        numero_monitorado: numero,
        dispositivo_id: dispositivo.id,
        versao_extensao: lote.versaoExtensao,
      },
    })),
  );

  // Ordem cronológica: a regra de abertura de conversa olha as mensagens anteriores do chat.
  const ordem = aceitas
    .map((a, i) => ({ id: a.id, em: Date.parse(lote.validos[i].enviada_em) }))
    .sort((a, b) => a.em - b.em);
  const vistas = new Set<string>();
  for (const { id } of ordem) {
    if (vistas.has(id)) continue;
    vistas.add(id);
    try {
      // Já processada (reenvio): sem efeito. Falha: status `erro`, para o reprocessamento.
      await processarEntrada(id);
    } catch (erro) {
      console.error(
        "Falha ao processar entrada do WhatsApp:",
        erro instanceof Error ? erro.message : erro,
      );
    }
  }

  return {
    status: 200,
    corpo: { aceitos: lote.validos.map((item) => item.wa_msg_id), erros: lote.erros },
  };
}

export type RespostaHeartbeat = { ultimo_sync_servidor: string | null; padroes_texto: string[] };

/** Sinal de vida do piolho: atualiza o dispositivo e devolve o último sync e os padrões de texto. */
export async function registrarHeartbeat(
  dispositivo: Dispositivo,
  corpo: unknown,
): Promise<RespostaIngestao<RespostaHeartbeat>> {
  const validacao = heartbeatSchema.safeParse(corpo);
  if (!validacao.success) {
    return {
      status: 400,
      corpo: { erro: `Corpo inválido: ${descreverErrosZod(validacao.error)}` },
    };
  }
  const dados = validacao.data;

  const numero = normalizarTelefone(dados.numero_monitorado);
  if (!numero)
    return { status: 400, corpo: { erro: "numero_monitorado não é um telefone válido" } };

  await garantirNumero(db, numero, dispositivo.usuarioId);
  await db
    .update(dispositivos)
    .set({
      numeroDetectado: numero,
      ultimoSinalEm: new Date(),
      ...(dados.ultimo_sync_em ? { ultimoSyncEm: new Date(dados.ultimo_sync_em) } : {}),
      filaPendente: dados.fila_pendente,
      versaoExtensao: dados.versao_extensao,
    })
    .where(eq(dispositivos.id, dispositivo.id));

  const [sync] = await db
    .select({ ultimo: max(mensagens.enviadaEm) })
    .from(mensagens)
    .where(eq(mensagens.numeroMonitorado, numero));
  const padroes = await db
    .selectDistinct({ padrao: origens.padraoTexto })
    .from(origens)
    .where(and(eq(origens.ativo, true), isNotNull(origens.padraoTexto)));

  return {
    status: 200,
    corpo: {
      ultimo_sync_servidor: sync?.ultimo ? new Date(sync.ultimo).toISOString() : null,
      padroes_texto: padroes
        .map((p) => p.padrao)
        .filter((p): p is string => Boolean(p && p.trim())),
    },
  };
}
