import { and, eq, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { origens, pessoas } from "@/db/schema";
import { casaPadrao, normalizarTexto } from "./normalizacao";

// Atribuição de origem (seção "Atribuição de origem" do CLAUDE.md do sistema-leads).
// Ponto ÚNICO de atribuição: os processadores chamam só `atribuirOrigem`.
//
// - `escolherOrigem` é PURA: recebe o contexto do toque e a lista de origens ATIVAS e decide.
// - `atribuirOrigem` carrega as origens ativas (uma consulta), chama `escolherOrigem` e, se
//   pedido, cria a origem automática (INSERT ON CONFLICT (codigo) DO NOTHING + SELECT).
// - `atualizarPrimeiroToque` mantém o cache `pessoas.origem_primeiro_toque_id`.
// - `recalcularAtribuicao` recalcula esse cache para todas as pessoas.
//
// A origem de um evento é definida no processamento da entrada e o evento nunca muda
// (regra de ouro 3). Para reatribuir depois de cadastrar uma origem, a gestão reprocessa a
// entrada bruta com `processarEntrada(id, { forcar: true })`: se o toque original ficou sem
// origem e agora há uma, entra um evento NOVO do mesmo tipo com `dados.reatribuicao = true` e
// `dados.evento_original_id` (ver `inserirEventoSeNaoExiste`). O último toque não é cache: é
// calculado na consulta (`src/consultas/toques.ts`).

export const CODIGO_DESCONHECIDA = "desconhecida";
export const NOME_DESCONHECIDA = "WhatsApp direto (desconhecida)";

export type UtmsAtribuicao = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
};

export type ContextoAtribuicao =
  | {
      canal: "whatsapp";
      numeroMonitorado: string;
      textoAbertura: string | null;
      ctwa: Record<string, unknown> | null;
    }
  | {
      canal: "lp_form";
      utm: UtmsAtribuicao;
      /** Campo oculto `origem` da LP (código da origem cadastrada). */
      origemCodigo?: string | null;
      fbclid?: string | null;
    }
  | {
      canal: "meta_form";
      metaFormId?: string | null;
      metaAdId?: string | null;
      metaAdsetId?: string | null;
      metaCampaignId?: string | null;
    };

export type Origem = typeof origens.$inferSelect;

/** Campos da origem que a escolha usa (uma `Origem` completa também serve). */
export type OrigemAtribuivel = Pick<
  Origem,
  | "id"
  | "codigo"
  | "nome"
  | "tipo"
  | "padraoTexto"
  | "metaAdId"
  | "metaFormId"
  | "utmSource"
  | "utmMedium"
  | "utmCampaign"
  | "criadaAutomaticamente"
>;

/** Origem que a atribuição pede para criar (ou reaproveitar pelo código, se já existir). */
export type OrigemAutomatica = {
  codigo: string;
  nome: string;
  tipo: "anuncio_ctwa" | "form_meta" | "desconhecida";
  metaAdId: string | null;
  metaFormId: string | null;
  criadaAutomaticamente: boolean;
};

export type EscolhaOrigem<O extends OrigemAtribuivel = OrigemAtribuivel> = {
  origem: O | null;
  criarAutomatica?: OrigemAutomatica;
  /** Por que a origem foi escolhida (ou por que nenhuma), para log e testes. */
  motivo: string;
};

const ID_META = /^\d{1,30}$/;

function idMeta(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0) return String(valor);
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  return ID_META.test(v) ? v : null;
}

function comoObjeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

/** Objetos aninhados onde o WhatsApp Web costuma pôr o contexto do anúncio. */
const CHAVES_ANINHADAS = [
  "ctwaContext",
  "ctwa_context",
  "externalAdReply",
  "external_ad_reply",
  "context",
];

function idDoObjeto(obj: Record<string, unknown>): string | null {
  // `ad_id`/`adId` são sempre id de anúncio.
  const direto = idMeta(obj.ad_id) ?? idMeta(obj.adId);
  if (direto) return direto;

  // `source_id`/`sourceId` só é anúncio quando o tipo da fonte é "ad" (ou não veio).
  // Com `source_type` "post", por exemplo, o id é de uma publicação, não de anúncio.
  const tipoFonte = obj.source_type ?? obj.sourceType;
  const ehAnuncio =
    tipoFonte === undefined || tipoFonte === null || String(tipoFonte).toLowerCase() === "ad";
  if (ehAnuncio) {
    const fonte = idMeta(obj.source_id) ?? idMeta(obj.sourceId);
    if (fonte) return fonte;
  }

  // Último recurso: `ad_id` na query da URL do anúncio. `fbclid` e UTMs são ignorados.
  const url = obj.source_url ?? obj.sourceUrl;
  if (typeof url === "string" && url.trim()) {
    try {
      const params = new URL(url.trim()).searchParams;
      const daUrl = idMeta(params.get("ad_id")) ?? idMeta(params.get("adId"));
      if (daUrl) return daUrl;
    } catch {
      // URL inválida: sem id.
    }
  }
  return null;
}

/**
 * Id do anúncio (Meta) no contexto de clique para WhatsApp (`ctwa`). Tolerante ao formato:
 * - chaves `ad_id`, `adId`, `source_id` ou `sourceId` (só dígitos; número também serve);
 * - `source_id`/`sourceId` são ignorados se `source_type`/`sourceType` vier diferente de "ad";
 * - `source_url`/`sourceUrl` só contribuem com um parâmetro `ad_id` na query (fbclid e UTMs
 *   são ignorados);
 * - `ctwa_clid` é o id do CLIQUE, não do anúncio, e nunca é usado;
 * - também procura um nível abaixo em `ctwaContext`, `externalAdReply` e `context`.
 */
export function extrairMetaAdIdDoCtwa(ctwa: unknown): string | null {
  const obj = comoObjeto(ctwa);
  if (!obj) return null;
  const topo = idDoObjeto(obj);
  if (topo) return topo;
  for (const chave of CHAVES_ANINHADAS) {
    const interno = comoObjeto(obj[chave]);
    if (interno) {
      const id = idDoObjeto(interno);
      if (id) return id;
    }
  }
  return null;
}

/** Comparação de códigos e UTMs: minúsculo, sem acento e sem espaços nas pontas. */
function chave(valor: string | null | undefined): string {
  return valor ? normalizarTexto(valor) : "";
}

/** Desempate estável: origem cadastrada à mão antes da automática; depois pelo código. */
function porPreferencia<O extends OrigemAtribuivel>(a: O, b: O): number {
  if (a.criadaAutomaticamente !== b.criadaAutomaticamente) return a.criadaAutomaticamente ? 1 : -1;
  return a.codigo.localeCompare(b.codigo);
}

function primeira<O extends OrigemAtribuivel>(lista: O[]): O | null {
  return lista.length ? [...lista].sort(porPreferencia)[0] : null;
}

export function origemAutomaticaAnuncio(adId: string): OrigemAutomatica {
  return {
    codigo: `anuncio-nao-cadastrado-${adId}`,
    nome: `Anúncio não cadastrado ${adId}`,
    tipo: "anuncio_ctwa",
    metaAdId: adId,
    metaFormId: null,
    criadaAutomaticamente: true,
  };
}

export function origemAutomaticaFormulario(formId: string): OrigemAutomatica {
  return {
    codigo: `formulario-nao-cadastrado-${formId}`,
    nome: `Formulário não cadastrado ${formId}`,
    tipo: "form_meta",
    metaAdId: null,
    metaFormId: formId,
    criadaAutomaticamente: true,
  };
}

const ORIGEM_DESCONHECIDA: OrigemAutomatica = {
  codigo: CODIGO_DESCONHECIDA,
  nome: NOME_DESCONHECIDA,
  tipo: "desconhecida",
  metaAdId: null,
  metaFormId: null,
  criadaAutomaticamente: false,
};

function escolherWhatsapp<O extends OrigemAtribuivel>(
  textoAbertura: string | null,
  ctwa: Record<string, unknown> | null,
  ativas: O[],
): EscolhaOrigem<O> {
  // 1) Anúncio de clique para WhatsApp.
  const adId = extrairMetaAdIdDoCtwa(ctwa);
  if (adId) {
    const porAnuncio = primeira(ativas.filter((o) => o.metaAdId?.trim() === adId));
    if (porAnuncio) return { origem: porAnuncio, motivo: `ctwa: anúncio ${adId}` };
    return {
      origem: null,
      criarAutomatica: origemAutomaticaAnuncio(adId),
      motivo: `ctwa: anúncio ${adId} não cadastrado`,
    };
  }

  // 2) Texto de abertura igual ao padrão ou começando com ele. O padrão mais longo vence.
  if (textoAbertura) {
    const casadas = ativas
      .filter((o) => o.padraoTexto && casaPadrao(textoAbertura, o.padraoTexto))
      .sort((a, b) => {
        const dif = normalizarTexto(b.padraoTexto!).length - normalizarTexto(a.padraoTexto!).length;
        return dif !== 0 ? dif : porPreferencia(a, b);
      });
    if (casadas.length) {
      return { origem: casadas[0], motivo: `padrão de texto: ${casadas[0].codigo}` };
    }
  }

  // 3) Sem casamento: "WhatsApp direto (desconhecida)".
  const desconhecida = ativas.find((o) => o.codigo === CODIGO_DESCONHECIDA);
  if (desconhecida) return { origem: desconhecida, motivo: "sem casamento: desconhecida" };
  return {
    origem: null,
    criarAutomatica: ORIGEM_DESCONHECIDA,
    motivo: "sem casamento: desconhecida (não cadastrada)",
  };
}

function escolherMetaForm<O extends OrigemAtribuivel>(
  formIdBruto: string | null | undefined,
  adIdBruto: string | null | undefined,
  ativas: O[],
): EscolhaOrigem<O> {
  const adId = idMeta(adIdBruto);
  const formId = idMeta(formIdBruto);

  // Anúncio vence formulário: o mesmo formulário pode rodar em vários anúncios.
  if (adId) {
    const porAnuncio = primeira(ativas.filter((o) => o.metaAdId?.trim() === adId));
    if (porAnuncio) return { origem: porAnuncio, motivo: `formulário Meta: anúncio ${adId}` };
  }
  if (formId) {
    const candidatas = ativas.filter((o) => o.metaFormId?.trim() === formId);
    // Prefere a origem só do formulário (sem anúncio fixo) à de outro anúncio do mesmo form.
    const semAnuncio = candidatas.filter((o) => !o.metaAdId?.trim());
    const porForm = primeira(semAnuncio) ?? primeira(candidatas);
    if (porForm) return { origem: porForm, motivo: `formulário Meta: formulário ${formId}` };
    return {
      origem: null,
      criarAutomatica: origemAutomaticaFormulario(formId),
      motivo: `formulário Meta: formulário ${formId} não cadastrado`,
    };
  }
  if (adId) {
    // Sem form_id (raro): a origem automática fica pelo anúncio, com tipo de formulário.
    return {
      origem: null,
      criarAutomatica: { ...origemAutomaticaAnuncio(adId), tipo: "form_meta" },
      motivo: `formulário Meta: anúncio ${adId} não cadastrado e sem formulário`,
    };
  }
  return { origem: null, motivo: "formulário Meta sem form_id nem ad_id" };
}

function escolherLp<O extends OrigemAtribuivel>(
  utm: UtmsAtribuicao,
  origemCodigo: string | null | undefined,
  ativas: O[],
): EscolhaOrigem<O> {
  // 1) Campo oculto `origem` igual ao código cadastrado.
  const codigo = chave(origemCodigo);
  if (codigo) {
    const porCodigo = ativas.find((o) => chave(o.codigo) === codigo);
    if (porCodigo) return { origem: porCodigo, motivo: `LP: campo origem ${porCodigo.codigo}` };
  }

  // 2) UTMs. Campo nulo na origem é coringa; a origem precisa ter utm_source ou utm_campaign
  //    preenchido (e batendo). Mais campos preenchidos batendo vence.
  const recebido = {
    source: chave(utm.source),
    medium: chave(utm.medium),
    campaign: chave(utm.campaign),
  };
  let melhor: { origem: O; pontos: number } | null = null;
  for (const o of ativas) {
    const campos = [
      [chave(o.utmSource), recebido.source],
      [chave(o.utmMedium), recebido.medium],
      [chave(o.utmCampaign), recebido.campaign],
    ] as const;
    if (!chave(o.utmSource) && !chave(o.utmCampaign)) continue;
    if (!campos.every(([esperado, veio]) => !esperado || esperado === veio)) continue;
    const pontos = campos.filter(([esperado]) => esperado).length;
    if (
      !melhor ||
      pontos > melhor.pontos ||
      (pontos === melhor.pontos && porPreferencia(o, melhor.origem) < 0)
    ) {
      melhor = { origem: o, pontos };
    }
  }
  if (melhor) return { origem: melhor.origem, motivo: `LP: UTMs (${melhor.pontos} campos)` };

  return { origem: null, motivo: "LP sem origem casada" };
}

/**
 * Escolhe a origem de um toque. PURA: recebe só as origens ativas.
 * - WhatsApp: ctwa (por meta_ad_id; anúncio não cadastrado pede origem automática), senão
 *   padrão de texto (igual ou "começa com"; o mais longo vence), senão "desconhecida".
 * - Formulário Meta: anúncio (ad_id) vence formulário (form_id); sem casamento pede origem
 *   automática "Formulário não cadastrado {form_id}"; sem ids, nenhuma.
 * - LP: campo oculto `origem` igual ao código, senão UTMs; sem casamento, nenhuma.
 * "Desconhecida" só existe para o WhatsApp.
 */
export function escolherOrigem<O extends OrigemAtribuivel>(
  contexto: ContextoAtribuicao,
  origensAtivas: O[],
): EscolhaOrigem<O> {
  switch (contexto.canal) {
    case "whatsapp":
      return escolherWhatsapp(contexto.textoAbertura, contexto.ctwa, origensAtivas);
    case "meta_form":
      return escolherMetaForm(contexto.metaFormId, contexto.metaAdId, origensAtivas);
    case "lp_form":
      return escolherLp(contexto.utm, contexto.origemCodigo, origensAtivas);
  }
}

/** Origens ativas com os campos usados na escolha. */
export async function carregarOrigensAtivas(tx: Tx): Promise<OrigemAtribuivel[]> {
  return tx
    .select({
      id: origens.id,
      codigo: origens.codigo,
      nome: origens.nome,
      tipo: origens.tipo,
      padraoTexto: origens.padraoTexto,
      metaAdId: origens.metaAdId,
      metaFormId: origens.metaFormId,
      utmSource: origens.utmSource,
      utmMedium: origens.utmMedium,
      utmCampaign: origens.utmCampaign,
      criadaAutomaticamente: origens.criadaAutomaticamente,
    })
    .from(origens)
    .where(eq(origens.ativo, true));
}

/**
 * Cria a origem automática se ainda não existir e devolve o id. Idempotente e seguro com
 * processamentos simultâneos: INSERT ON CONFLICT (codigo) DO NOTHING seguido de SELECT.
 * Se já existir uma origem com o mesmo código (mesmo inativa), ela é reaproveitada.
 */
export async function garantirOrigemAutomatica(tx: Tx, nova: OrigemAutomatica): Promise<string> {
  await tx
    .insert(origens)
    .values({
      codigo: nova.codigo,
      nome: nova.nome,
      tipo: nova.tipo,
      metaAdId: nova.metaAdId,
      metaFormId: nova.metaFormId,
      ativo: true,
      criadaAutomaticamente: nova.criadaAutomaticamente,
    })
    .onConflictDoNothing({ target: origens.codigo });
  const [linha] = await tx
    .select({ id: origens.id })
    .from(origens)
    .where(eq(origens.codigo, nova.codigo))
    .limit(1);
  if (!linha) throw new Error(`Origem automática ${nova.codigo} não encontrada após gravação`);
  return linha.id;
}

/** Id da origem atribuída ao contexto, ou null quando não há atribuição. */
export async function atribuirOrigem(tx: Tx, contexto: ContextoAtribuicao): Promise<string | null> {
  const ativas = await carregarOrigensAtivas(tx);
  const escolha = escolherOrigem(contexto, ativas);
  if (escolha.origem) return escolha.origem.id;
  if (escolha.criarAutomatica) return garantirOrigemAutomatica(tx, escolha.criarAutomatica);
  return null;
}

/**
 * Origem do primeiro toque da pessoa (subconsulta correlacionada com "pessoas"."id"):
 * a do evento mais antigo com origem. Empate no horário: o registrado primeiro.
 */
const PRIMEIRO_TOQUE = sql`(
  select e.origem_id from eventos e
  where e.pessoa_id = "pessoas"."id" and e.origem_id is not null
  order by e.ocorrido_em asc, e.registrado_em asc, e.id asc
  limit 1
)`;

/**
 * Atualiza o cache `pessoas.origem_primeiro_toque_id` de uma pessoa a partir dos eventos.
 * Devolve true se o valor mudou. Os processadores chamam ao gravar um toque com origem.
 */
export async function atualizarPrimeiroToque(tx: Tx, pessoaId: string): Promise<boolean> {
  const alteradas = await tx
    .update(pessoas)
    .set({ origemPrimeiroToqueId: PRIMEIRO_TOQUE })
    .where(
      and(
        eq(pessoas.id, pessoaId),
        sql`${pessoas.origemPrimeiroToqueId} is distinct from ${PRIMEIRO_TOQUE}`,
      ),
    )
    .returning({ id: pessoas.id });
  return alteradas.length > 0;
}

/**
 * Recalcula o cache do primeiro toque de todas as pessoas (não mescladas) a partir dos
 * eventos existentes. NÃO altera eventos: a origem de cada evento é definida no processamento;
 * para reatribuir um toque, reprocesse a entrada com `forcar` (ver o topo deste arquivo).
 * Com `somenteSemOrigem`, só as pessoas ainda sem origem no cache. Devolve quantas mudaram.
 */
export async function recalcularAtribuicao(
  opcoes: { somenteSemOrigem?: boolean } = {},
): Promise<{ pessoasAtualizadas: number }> {
  const condicoes = [
    isNull(pessoas.mescladaParaId),
    sql`${pessoas.origemPrimeiroToqueId} is distinct from ${PRIMEIRO_TOQUE}`,
  ];
  if (opcoes.somenteSemOrigem) condicoes.push(isNull(pessoas.origemPrimeiroToqueId));
  const alteradas = await db
    .update(pessoas)
    .set({ origemPrimeiroToqueId: PRIMEIRO_TOQUE })
    .where(and(...condicoes))
    .returning({ id: pessoas.id });
  return { pessoasAtualizadas: alteradas.length };
}
