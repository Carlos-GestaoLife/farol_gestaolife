import { z } from "zod";
import type { Tx } from "@/db";
import { atribuirOrigem } from "../atribuicao";
import { registrarDataContato } from "../contato";
import { definirEstagioInicialSeVazio } from "../estagios";
import { inserirEventoSeNaoExiste } from "../eventos";
import { dataDoEnvio, extrairCamposFramer } from "../framer";
import { montarIdentificadores, resolverPessoa } from "../identidade";
import type { EntradaBruta } from "../registro";

// Processador da fonte `framer`: um envio de formulário de LP (POST /api/webhooks/framer).
// Reexecutável: identidade idempotente, evento com inserirEventoSeNaoExiste, estágio inicial
// só se vazio e datas de contato com min/max.

export const payloadFramerSchema = z.object({
  interpretado: z.boolean(),
  corpo: z.unknown(),
  cabecalhos: z.record(z.string(), z.string().nullable()).optional(),
  recebido_em: z.string().optional(),
});

export async function processarFramer(tx: Tx, entrada: EntradaBruta): Promise<void> {
  const p = payloadFramerSchema.parse(entrada.payload);
  if (!p.interpretado) {
    const tipo = p.cabecalhos?.["content-type"] ?? "ausente";
    throw new Error(
      `Corpo do Framer não interpretado (content-type ${tipo}): não é JSON nem formulário. ` +
        `Veja o payload da entrada e ajuste interpretarCorpoFramer/extrairCamposFramer.`,
    );
  }

  const c = extrairCamposFramer(p.corpo);
  const lista = montarIdentificadores({ telefone: c.telefone, email: c.email });
  if (lista.length === 0) {
    const nomes = Object.keys(c.outros);
    throw new Error(
      `Envio do Framer sem telefone nem e-mail válido (telefone: ${c.telefone ?? "ausente"}, ` +
        `e-mail: ${c.email ?? "ausente"}). Campos não reconhecidos: ` +
        `${nomes.length ? nomes.join(", ") : "nenhum"}. Se o formato mudou, ajuste extrairCamposFramer.`,
    );
  }

  const { pessoaId } = await resolverPessoa(tx, lista, {
    nomeExibicao: c.nome,
    entradaBrutaId: entrada.id,
  });
  await definirEstagioInicialSeVazio(tx, pessoaId);

  // Data do payload, se vier; senão o momento em que o webhook chegou (não o do processamento,
  // que pode ser bem depois num reprocessamento).
  const ocorridoEm = dataDoEnvio(c.enviado_em) ?? entrada.recebidoEm;

  const utm = {
    source: c.utm_source,
    medium: c.utm_medium,
    campaign: c.utm_campaign,
    content: c.utm_content,
    term: c.utm_term,
  };
  const origemId = await atribuirOrigem(tx, {
    canal: "lp_form",
    utm,
    origemCodigo: c.origem,
    fbclid: c.fbclid,
  });

  await inserirEventoSeNaoExiste(tx, {
    pessoaId,
    tipo: "form_enviado",
    ocorridoEm,
    canal: "lp_form",
    origemId,
    entradaBrutaId: entrada.id,
    dados: {
      nome: c.nome,
      telefone: c.telefone,
      email: c.email,
      cidade: c.cidade,
      utm_source: c.utm_source,
      utm_medium: c.utm_medium,
      utm_campaign: c.utm_campaign,
      utm_content: c.utm_content,
      utm_term: c.utm_term,
      origem: c.origem,
      fbclid: c.fbclid,
      outros: c.outros,
    },
  });

  await registrarDataContato(tx, pessoaId, ocorridoEm);
}
