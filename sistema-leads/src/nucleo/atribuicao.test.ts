import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  entradasBrutas,
  eventos,
  filaRevisao,
  identificadores,
  mensagens,
  numeros,
  origens,
  pessoas,
} from "@/db/schema";
import { carregarOrigem, listarOrigensComContagem } from "@/consultas/origens";
import { primeiroEUltimoToque } from "@/consultas/toques";
import {
  escolherOrigem,
  extrairMetaAdIdDoCtwa,
  recalcularAtribuicao,
  type ContextoAtribuicao,
  type OrigemAtribuivel,
} from "./atribuicao";
import { processarEntrada, registrarEntradas } from "./entradas";
import { inserirEventoSeNaoExiste } from "./eventos";
import { normalizarTexto } from "./normalizacao";
import { celularAleatorio, emTransacaoDesfeita, temBanco } from "./teste/banco";

function origem(parcial: Partial<OrigemAtribuivel> & { codigo: string }): OrigemAtribuivel {
  return {
    id: `id-${parcial.codigo}`,
    nome: parcial.codigo,
    tipo: "link_whatsapp",
    padraoTexto: null,
    metaAdId: null,
    metaFormId: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    criadaAutomaticamente: false,
    ...parcial,
  };
}

const DESCONHECIDA = origem({ codigo: "desconhecida", tipo: "desconhecida" });

function whatsapp(textoAbertura: string | null, ctwa: Record<string, unknown> | null = null) {
  return { canal: "whatsapp", numeroMonitorado: "5562999990000", textoAbertura, ctwa } as const;
}

function lp(utm: Partial<Record<"source" | "medium" | "campaign", string>>, origemCodigo?: string) {
  return {
    canal: "lp_form",
    utm: {
      source: utm.source ?? null,
      medium: utm.medium ?? null,
      campaign: utm.campaign ?? null,
      content: null,
      term: null,
    },
    origemCodigo: origemCodigo ?? null,
  } as const;
}

describe("extrairMetaAdIdDoCtwa", () => {
  it("aceita source_id, ad_id, sourceId e adId (texto ou número)", () => {
    expect(extrairMetaAdIdDoCtwa({ source_id: "120210000000001" })).toBe("120210000000001");
    expect(extrairMetaAdIdDoCtwa({ ad_id: " 2001 " })).toBe("2001");
    expect(extrairMetaAdIdDoCtwa({ sourceId: "3001", sourceType: "ad" })).toBe("3001");
    expect(extrairMetaAdIdDoCtwa({ adId: 4001 })).toBe("4001");
  });

  it("procura um nível abaixo (ctwaContext, externalAdReply)", () => {
    expect(extrairMetaAdIdDoCtwa({ ctwaContext: { sourceId: "5001", sourceType: "ad" } })).toBe(
      "5001",
    );
    expect(extrairMetaAdIdDoCtwa({ externalAdReply: { source_id: "6001" } })).toBe("6001");
  });

  it("ignora ctwa_clid, fonte que não é anúncio, fbclid e UTMs da URL", () => {
    expect(extrairMetaAdIdDoCtwa({ ctwa_clid: "Afh7xyz" })).toBeNull();
    expect(extrairMetaAdIdDoCtwa({ source_id: "7001", source_type: "post" })).toBeNull();
    expect(
      extrairMetaAdIdDoCtwa({
        source_url: "https://fb.me/abc?fbclid=123&utm_source=fb&utm_content=999",
      }),
    ).toBeNull();
    expect(
      extrairMetaAdIdDoCtwa({ sourceUrl: "https://www.facebook.com/ads/?ad_id=8001&fbclid=x" }),
    ).toBe("8001");
    expect(extrairMetaAdIdDoCtwa({ source_url: "não é url" })).toBeNull();
    expect(extrairMetaAdIdDoCtwa({ source_id: "abc" })).toBeNull();
    expect(extrairMetaAdIdDoCtwa(null)).toBeNull();
    expect(extrairMetaAdIdDoCtwa("2001")).toBeNull();
    expect(extrairMetaAdIdDoCtwa([{ ad_id: "1" }])).toBeNull();
  });
});

describe("escolherOrigem: WhatsApp", () => {
  const anuncio = origem({ codigo: "anuncio-gnv", tipo: "anuncio_ctwa", metaAdId: "2001" });
  const curto = origem({
    codigo: "gnv",
    padraoTexto: normalizarTexto("Quero saber do Gestão na Veia"),
  });
  const longo = origem({
    codigo: "gnv-maceio",
    padraoTexto: normalizarTexto("Quero saber do Gestão na Veia Maceió"),
  });
  const ativas = [DESCONHECIDA, anuncio, curto, longo];

  it("ctwa com anúncio cadastrado: a origem do anúncio (vence o texto)", () => {
    const r = escolherOrigem(
      whatsapp("Quero saber do Gestão na Veia", { source_id: "2001" }),
      ativas,
    );
    expect(r.origem?.codigo).toBe("anuncio-gnv");
    expect(r.criarAutomatica).toBeUndefined();
  });

  it("ctwa sem cadastro: pede origem automática do anúncio", () => {
    const r = escolherOrigem(whatsapp("Oi", { sourceId: "99887766", sourceType: "ad" }), ativas);
    expect(r.origem).toBeNull();
    expect(r.criarAutomatica).toEqual({
      codigo: "anuncio-nao-cadastrado-99887766",
      nome: "Anúncio não cadastrado 99887766",
      tipo: "anuncio_ctwa",
      metaAdId: "99887766",
      metaFormId: null,
      criadaAutomaticamente: true,
    });
  });

  it("texto igual ao padrão", () => {
    expect(escolherOrigem(whatsapp("quero saber do gestao na veia"), ativas).origem?.codigo).toBe(
      "gnv",
    );
  });

  it("texto que começa com o padrão, com acento, maiúsculas e emoji", () => {
    const r = escolherOrigem(whatsapp("🙂 QUERO saber do  Gestão na Veia!! 🚀 Tem vaga?"), [
      DESCONHECIDA,
      curto,
    ]);
    expect(r.origem?.codigo).toBe("gnv");
  });

  it("dois padrões casando: o mais longo vence", () => {
    const r = escolherOrigem(whatsapp("Quero saber do Gestão na Veia Maceió 😍 por favor"), ativas);
    expect(r.origem?.codigo).toBe("gnv-maceio");
  });

  it("sem casamento: desconhecida; se não existir, pede a criação dela", () => {
    expect(escolherOrigem(whatsapp("Bom dia"), ativas).origem?.codigo).toBe("desconhecida");
    expect(escolherOrigem(whatsapp(null), ativas).origem?.codigo).toBe("desconhecida");
    const r = escolherOrigem(whatsapp("Bom dia"), [curto]);
    expect(r.origem).toBeNull();
    expect(r.criarAutomatica).toMatchObject({ codigo: "desconhecida", tipo: "desconhecida" });
  });

  it("texto que só contém o padrão no meio não casa", () => {
    expect(
      escolherOrigem(whatsapp("Oi, quero saber do Gestão na Veia"), ativas).origem?.codigo,
    ).toBe("desconhecida");
  });
});

describe("escolherOrigem: formulário da Meta", () => {
  const porAnuncio = origem({ codigo: "anuncio-form", tipo: "form_meta", metaAdId: "2001" });
  const porForm = origem({ codigo: "form-gnv", tipo: "form_meta", metaFormId: "5001" });
  const ativas = [DESCONHECIDA, porAnuncio, porForm];
  const meta = (metaFormId: string | null, metaAdId: string | null): ContextoAtribuicao => ({
    canal: "meta_form",
    metaFormId,
    metaAdId,
  });

  it("por ad_id (anúncio vence formulário)", () => {
    expect(escolherOrigem(meta("5001", "2001"), ativas).origem?.codigo).toBe("anuncio-form");
  });

  it("por form_id quando o anúncio não está cadastrado", () => {
    expect(escolherOrigem(meta("5001", "9999"), ativas).origem?.codigo).toBe("form-gnv");
  });

  it("nada casa: pede origem automática do formulário", () => {
    const r = escolherOrigem(meta("7007", "9999"), ativas);
    expect(r.origem).toBeNull();
    expect(r.criarAutomatica).toEqual({
      codigo: "formulario-nao-cadastrado-7007",
      nome: "Formulário não cadastrado 7007",
      tipo: "form_meta",
      metaAdId: null,
      metaFormId: "7007",
      criadaAutomaticamente: true,
    });
  });

  it("sem ids: nenhuma origem (desconhecida é só do WhatsApp)", () => {
    const r = escolherOrigem(meta(null, null), ativas);
    expect(r.origem).toBeNull();
    expect(r.criarAutomatica).toBeUndefined();
  });
});

describe("escolherOrigem: LP", () => {
  const porCodigo = origem({ codigo: "lp-gnv-maceio", tipo: "lp" });
  const soCampanha = origem({ codigo: "campanha", tipo: "lp", utmCampaign: "gnv-maceio" });
  const campanhaEFonte = origem({
    codigo: "campanha-instagram",
    tipo: "lp",
    utmSource: "Instagram",
    utmCampaign: "gnv-maceio",
  });
  const soMedium = origem({ codigo: "so-medium", tipo: "lp", utmMedium: "cpc" });
  const ativas = [DESCONHECIDA, porCodigo, soCampanha, campanhaEFonte, soMedium];

  it("campo oculto origem igual ao código (normalizado)", () => {
    expect(
      escolherOrigem(lp({ campaign: "gnv-maceio" }, "  LP-GNV-Maceio "), ativas).origem?.codigo,
    ).toBe("lp-gnv-maceio");
  });

  it("UTMs: campo nulo é coringa e mais campos batendo vence", () => {
    expect(
      escolherOrigem(lp({ source: "instagram", medium: "stories", campaign: "GNV-Maceio" }), ativas)
        .origem?.codigo,
    ).toBe("campanha-instagram");
    expect(
      escolherOrigem(lp({ source: "google", campaign: "gnv-maceio" }), ativas).origem?.codigo,
    ).toBe("campanha");
  });

  it("código desconhecido cai nas UTMs; sem casamento, nenhuma", () => {
    expect(
      escolherOrigem(lp({ campaign: "gnv-maceio" }, "nao-existe"), ativas).origem?.codigo,
    ).toBe("campanha");
    // Só utm_medium batendo não basta (precisa de source ou campaign na origem).
    const r = escolherOrigem(lp({ medium: "cpc", campaign: "outra" }), ativas);
    expect(r.origem).toBeNull();
    expect(r.criarAutomatica).toBeUndefined();
  });
});

describe.skipIf(!temBanco)("atribuição de origem (integração)", () => {
  const numero = celularAleatorio().canonico;
  const sufixo = randomUUID().slice(0, 8);
  const adId = String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  const codigoAuto = `anuncio-nao-cadastrado-${adId}`;
  const codigos = [
    codigoAuto,
    `teste-padrao-${sufixo}`,
    `teste-utm-${sufixo}`,
    `teste-reatrib-${sufixo}`,
  ];
  const chavesFramer: string[] = [];
  const pessoasCriadas = new Set<string>();

  afterAll(async () => {
    const ids = [...pessoasCriadas];
    await db.delete(mensagens).where(eq(mensagens.numeroMonitorado, numero));
    if (ids.length) {
      await db.delete(eventos).where(inArray(eventos.pessoaId, ids));
      await db.delete(filaRevisao).where(inArray(filaRevisao.pessoaAId, ids));
      await db.delete(identificadores).where(inArray(identificadores.pessoaId, ids));
      await db.delete(pessoas).where(inArray(pessoas.id, ids));
    }
    await db
      .delete(entradasBrutas)
      .where(
        and(
          eq(entradasBrutas.fonte, "whatsapp"),
          like(entradasBrutas.chaveIdempotencia, `${numero}:%`),
        ),
      );
    if (chavesFramer.length) {
      await db
        .delete(entradasBrutas)
        .where(
          and(
            eq(entradasBrutas.fonte, "framer"),
            inArray(entradasBrutas.chaveIdempotencia, chavesFramer),
          ),
        );
    }
    await db.delete(numeros).where(eq(numeros.numero, numero));
    await db.delete(origens).where(inArray(origens.codigo, codigos));
  });

  async function mensagemWhatsapp(opcoes: {
    texto: string;
    ctwa?: Record<string, unknown> | null;
  }) {
    const tel = celularAleatorio();
    const waMsgId = `true_${tel.canonico}@c.us_${randomUUID()}`;
    const {
      aceitas: [entrada],
    } = await registrarEntradas([
      {
        fonte: "whatsapp",
        chaveIdempotencia: `${numero}:${waMsgId}`,
        payload: {
          numero_monitorado: numero,
          wa_msg_id: waMsgId,
          chat_id: `${tel.canonico}@c.us`,
          direcao: "in",
          enviada_em: new Date(Date.now() - 60_000).toISOString(),
          tipo_midia: "texto",
          contato: {
            wa_id: `${tel.canonico}@c.us`,
            telefone: tel.canonico,
            nome_agenda: null,
            pushname: "Teste",
          },
          texto_abertura: opcoes.texto,
          ctwa: opcoes.ctwa ?? null,
          dispositivo_id: null,
          versao_extensao: null,
        },
      },
    ]);
    expect((await processarEntrada(entrada.id)).status).toBe("processado");
    return entrada.id;
  }

  async function formularioFramer(corpo: Record<string, string>) {
    const chave = `teste-atribuicao-${randomUUID()}`;
    chavesFramer.push(chave);
    const {
      aceitas: [entrada],
    } = await registrarEntradas([
      { fonte: "framer", chaveIdempotencia: chave, payload: { interpretado: true, corpo } },
    ]);
    expect((await processarEntrada(entrada.id)).status).toBe("processado");
    return entrada.id;
  }

  async function eventosDaEntrada(entradaId: string) {
    const evs = await db
      .select()
      .from(eventos)
      .where(eq(eventos.entradaBrutaId, entradaId))
      .orderBy(eventos.registradoEm);
    evs.forEach((e) => pessoasCriadas.add(e.pessoaId));
    return evs;
  }

  async function primeiroToqueEmCache(pessoaId: string) {
    const [p] = await db
      .select({ origem: pessoas.origemPrimeiroToqueId })
      .from(pessoas)
      .where(eq(pessoas.id, pessoaId));
    return p.origem;
  }

  it("ctwa de anúncio não cadastrado cria origem automática; reprocessar não cria outra", async () => {
    const entradaId = await mensagemWhatsapp({
      texto: "Olá, vim pelo anúncio",
      ctwa: { source_id: adId, source_type: "ad" },
    });
    const auto = await db.select().from(origens).where(eq(origens.codigo, codigoAuto));
    expect(auto).toHaveLength(1);
    expect(auto[0]).toMatchObject({
      nome: `Anúncio não cadastrado ${adId}`,
      tipo: "anuncio_ctwa",
      metaAdId: adId,
      criadaAutomaticamente: true,
      ativo: true,
    });

    const evs = await eventosDaEntrada(entradaId);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ tipo: "conversa_iniciada", origemId: auto[0].id });
    expect(await primeiroToqueEmCache(evs[0].pessoaId)).toBe(auto[0].id);

    // Reprocessamento forçado da mesma entrada: nenhuma origem nova e nenhum evento novo.
    expect((await processarEntrada(entradaId, { forcar: true })).status).toBe("processado");
    expect(await db.select().from(origens).where(eq(origens.codigo, codigoAuto))).toHaveLength(1);
    expect(await eventosDaEntrada(entradaId)).toHaveLength(1);

    // Outra pessoa pelo mesmo anúncio: reaproveita a origem automática.
    const outra = await mensagemWhatsapp({
      texto: "Oi",
      ctwa: { ctwaContext: { sourceId: adId } },
    });
    expect((await eventosDaEntrada(outra))[0].origemId).toBe(auto[0].id);
    expect(await db.select().from(origens).where(eq(origens.codigo, codigoAuto))).toHaveLength(1);

    // Contagens da tela Origens: 2 leads (primeiro toque) e 2 toques.
    expect(await carregarOrigem(auto[0].id)).toMatchObject({ leads: 2, toques: 2 });
    const lista = await listarOrigensComContagem();
    expect(lista.find((o) => o.id === auto[0].id)).toMatchObject({ leads: 2, toques: 2 });
  });

  it("texto de abertura com acento e emoji casa o padrão cadastrado", async () => {
    const [o] = await db
      .insert(origens)
      .values({
        codigo: `teste-padrao-${sufixo}`,
        nome: "Link de teste",
        tipo: "link_whatsapp",
        padraoTexto: normalizarTexto(`Quero saber do evento ${sufixo}`),
      })
      .returning();
    const entradaId = await mensagemWhatsapp({
      texto: `😀 Quero SABER do evento ${sufixo.toUpperCase()} em Maceió`,
    });
    const [ev] = await eventosDaEntrada(entradaId);
    expect(ev.origemId).toBe(o.id);
    expect(await primeiroToqueEmCache(ev.pessoaId)).toBe(o.id);
  });

  it("Framer com UTMs casa a origem (coringa em utm_medium)", async () => {
    const [o] = await db
      .insert(origens)
      .values({
        codigo: `teste-utm-${sufixo}`,
        nome: "LP de teste",
        tipo: "lp",
        utmSource: "instagram",
        utmCampaign: `campanha-${sufixo}`,
      })
      .returning();
    const tel = celularAleatorio();
    const entradaId = await formularioFramer({
      nome: "Lead UTM",
      telefone: `+${tel.canonico}`,
      utm_source: "Instagram",
      utm_medium: "stories",
      utm_campaign: `CAMPANHA-${sufixo}`,
    });
    const [ev] = await eventosDaEntrada(entradaId);
    expect(ev).toMatchObject({ tipo: "form_enviado", canal: "lp_form", origemId: o.id });
    expect(await primeiroToqueEmCache(ev.pessoaId)).toBe(o.id);

    // O cache é recalculável: apagado à mão, volta pelo recalcularAtribuicao.
    await db
      .update(pessoas)
      .set({ origemPrimeiroToqueId: null })
      .where(eq(pessoas.id, ev.pessoaId));
    const r = await recalcularAtribuicao();
    expect(r.pessoasAtualizadas).toBeGreaterThanOrEqual(1);
    expect(await primeiroToqueEmCache(ev.pessoaId)).toBe(o.id);
    expect((await recalcularAtribuicao()).pessoasAtualizadas).toBe(0);
  });

  it("forcar com reatribuição: evento novo com reatribuicao e o antigo intacto", async () => {
    const tel = celularAleatorio();
    const campanha = `reatrib-${sufixo}`;
    const entradaId = await formularioFramer({
      nome: "Lead sem origem",
      telefone: `+${tel.canonico}`,
      utm_campaign: campanha,
    });
    const [original] = await eventosDaEntrada(entradaId);
    expect(original.origemId).toBeNull();
    expect(await primeiroToqueEmCache(original.pessoaId)).toBeNull();

    const [o] = await db
      .insert(origens)
      .values({
        codigo: `teste-reatrib-${sufixo}`,
        nome: "Campanha cadastrada depois",
        tipo: "lp",
        utmCampaign: campanha,
      })
      .returning();

    // Sem forcar, entrada já processada não é tocada.
    expect((await processarEntrada(entradaId)).status).toBe("sem_efeito");
    expect(await eventosDaEntrada(entradaId)).toHaveLength(1);

    expect((await processarEntrada(entradaId, { forcar: true })).status).toBe("processado");
    const evs = await eventosDaEntrada(entradaId);
    expect(evs).toHaveLength(2);
    const antigo = evs.find((e) => e.id === original.id)!;
    expect(antigo).toEqual(original);
    const novo = evs.find((e) => e.id !== original.id)!;
    expect(novo).toMatchObject({
      tipo: "form_enviado",
      canal: "lp_form",
      origemId: o.id,
      pessoaId: original.pessoaId,
    });
    expect(novo.ocorridoEm.getTime()).toBe(original.ocorridoEm.getTime());
    expect(novo.dados).toMatchObject({
      reatribuicao: true,
      evento_original_id: original.id,
      utm_campaign: campanha,
    });
    expect(await primeiroToqueEmCache(original.pessoaId)).toBe(o.id);

    // Forçar de novo não reatribui outra vez.
    await processarEntrada(entradaId, { forcar: true });
    expect(await eventosDaEntrada(entradaId)).toHaveLength(2);

    // Primeiro e último toque: o evento original não tem origem, então os dois são o novo.
    const toques = await primeiroEUltimoToque(original.pessoaId);
    expect(toques.primeiro?.origem.id).toBe(o.id);
    expect(toques.ultimo?.evento.id).toBe(novo.id);
  });

  it("inserirEventoSeNaoExiste: reatribuição só com a opção, com origem nova e uma vez", async () => {
    await emTransacaoDesfeita(async (tx) => {
      const [p] = await tx.insert(pessoas).values({ nomeExibicao: "Transação" }).returning();
      const [e] = await tx
        .insert(entradasBrutas)
        .values({ fonte: "outra", chaveIdempotencia: `teste-${randomUUID()}`, payload: {} })
        .returning();
      const [o] = await tx
        .select({ id: origens.id })
        .from(origens)
        .where(eq(origens.codigo, "desconhecida"));
      const base = {
        pessoaId: p.id,
        tipo: "conversa_iniciada" as const,
        ocorridoEm: new Date(),
        canal: "whatsapp" as const,
        entradaBrutaId: e.id,
        dados: { chat_id: "x" },
      };
      const primeiro = await inserirEventoSeNaoExiste(tx, { ...base, origemId: null });
      expect(primeiro.inserido).toBe(true);
      expect(await inserirEventoSeNaoExiste(tx, { ...base, origemId: o.id })).toEqual({
        id: primeiro.id,
        inserido: false,
      });
      expect(
        await inserirEventoSeNaoExiste(
          tx,
          { ...base, origemId: null },
          { permitirReatribuicao: true },
        ),
      ).toEqual({ id: primeiro.id, inserido: false });
      const reatrib = await inserirEventoSeNaoExiste(
        tx,
        { ...base, origemId: o.id },
        { permitirReatribuicao: true },
      );
      expect(reatrib).toMatchObject({ inserido: true, reatribuido: true });
      const [novo] = await tx.select().from(eventos).where(eq(eventos.id, reatrib.id));
      expect(novo.dados).toEqual({
        chat_id: "x",
        reatribuicao: true,
        evento_original_id: primeiro.id,
      });
      expect(
        await inserirEventoSeNaoExiste(
          tx,
          { ...base, origemId: o.id },
          { permitirReatribuicao: true },
        ),
      ).toEqual({ id: primeiro.id, inserido: false });
    });
  });
});
