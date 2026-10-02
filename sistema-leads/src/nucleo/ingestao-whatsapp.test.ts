import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { celularAleatorio, temBanco } from "./teste/banco";
import { db } from "@/db";
import {
  dispositivos,
  entradasBrutas,
  estagios,
  eventos,
  filaRevisao,
  identificadores,
  mensagens,
  numeros,
  origens,
  pessoas,
} from "@/db/schema";
import { gerarTokenDispositivo, hashToken, type Dispositivo } from "./dispositivos";
import { ingerirWhatsapp, registrarHeartbeat } from "./ingestao-whatsapp";

const MIN = 60_000;
const DIA = 24 * 60 * MIN;

describe.skipIf(!temBanco)("ingestão do WhatsApp (integração)", () => {
  const monitorado = celularAleatorio();
  const numero = monitorado.canonico;
  const codigoOrigem = `teste-${randomUUID()}`;
  const padrao = `quero saber do evento teste ${randomUUID().slice(0, 8)}`;
  let dispositivo: Dispositivo;

  beforeAll(async () => {
    [dispositivo] = await db
      .insert(dispositivos)
      .values({ nome: `Teste ${randomUUID()}`, tokenHash: hashToken(gerarTokenDispositivo()) })
      .returning();
  });

  afterAll(async () => {
    const entradas = await db
      .select({ id: entradasBrutas.id })
      .from(entradasBrutas)
      .where(
        and(
          eq(entradasBrutas.fonte, "whatsapp"),
          like(entradasBrutas.chaveIdempotencia, `${numero}:%`),
        ),
      );
    const idsEntradas = entradas.map((e) => e.id);
    const msgs = await db
      .select({ pessoaId: mensagens.pessoaId })
      .from(mensagens)
      .where(eq(mensagens.numeroMonitorado, numero));
    const idsPessoas = [...new Set(msgs.map((m) => m.pessoaId))];

    await db.delete(mensagens).where(eq(mensagens.numeroMonitorado, numero));
    if (idsPessoas.length) {
      await db.delete(eventos).where(inArray(eventos.pessoaId, idsPessoas));
      await db.delete(filaRevisao).where(inArray(filaRevisao.pessoaAId, idsPessoas));
      await db.delete(identificadores).where(inArray(identificadores.pessoaId, idsPessoas));
      await db.delete(pessoas).where(inArray(pessoas.id, idsPessoas));
    }
    if (idsEntradas.length)
      await db.delete(entradasBrutas).where(inArray(entradasBrutas.id, idsEntradas));
    if (dispositivo) await db.delete(dispositivos).where(eq(dispositivos.id, dispositivo.id));
    await db.delete(numeros).where(eq(numeros.numero, numero));
    await db.delete(origens).where(eq(origens.codigo, codigoOrigem));
  });

  function contato(tel: { canonico: string; semNono: string }, pushname = "Maria") {
    // wa_id no formato antigo (sem o nono dígito) e telefone já com o nono: mesma pessoa.
    return {
      wa_id: `${tel.semNono}@c.us`,
      telefone: `+${tel.canonico}`,
      nome_agenda: null,
      pushname,
    };
  }

  function msg(
    tel: { canonico: string; semNono: string },
    id: string,
    direcao: "in" | "out",
    em: Date,
    texto: string | null = null,
  ) {
    return {
      wa_msg_id: `${direcao === "out"}_${tel.semNono}@c.us_${id}`,
      chat_id: `${tel.semNono}@c.us`,
      direcao,
      enviada_em: em.toISOString(),
      tipo_midia: "texto",
      contato: contato(tel),
      texto_abertura: texto,
      ctwa: null,
    };
  }

  const lote = (itens: unknown[]) => ({
    versao_extensao: "0.1.0",
    numero_monitorado: monitorado.semNono,
    itens,
  });

  async function pessoaDe(tel: { canonico: string }) {
    const donos = await db
      .select({ pessoaId: identificadores.pessoaId })
      .from(identificadores)
      .where(and(eq(identificadores.tipo, "telefone"), eq(identificadores.valor, tel.canonico)));
    expect(donos).toHaveLength(1);
    const [p] = await db
      .select({
        id: pessoas.id,
        nome: pessoas.nomeExibicao,
        estagio: estagios.nome,
        primeiro: pessoas.primeiroContatoEm,
        ultimo: pessoas.ultimoContatoEm,
      })
      .from(pessoas)
      .leftJoin(estagios, eq(pessoas.estagioId, estagios.id))
      .where(eq(pessoas.id, donos[0].pessoaId));
    return p;
  }

  async function contar(pessoaId: string) {
    const ms = await db.select().from(mensagens).where(eq(mensagens.pessoaId, pessoaId));
    const evs = await db.select().from(eventos).where(eq(eventos.pessoaId, pessoaId));
    return { mensagens: ms, eventos: evs };
  }

  it("2 recebidas, 1 enviada e reenvio: 1 pessoa, eventos certos e nada duplicado", async () => {
    const tel = celularAleatorio();
    const t0 = new Date(Date.now() - 2 * 60 * MIN);
    const recebidas = [
      msg(tel, "A1", "in", t0, "Olá! Vi o anúncio"),
      msg(tel, "A2", "in", new Date(t0.getTime() + MIN), "Ainda estou esperando"),
    ];

    const r1 = await ingerirWhatsapp(dispositivo, lote(recebidas));
    expect(r1).toEqual({
      status: 200,
      corpo: { aceitos: recebidas.map((m) => m.wa_msg_id), erros: [] },
    });

    const p = await pessoaDe(tel);
    expect(p).toMatchObject({ nome: "Maria", estagio: "Novo lead" });
    expect(p.primeiro?.getTime()).toBe(t0.getTime());
    expect(p.ultimo?.getTime()).toBe(t0.getTime() + MIN);
    const ids = await db.select().from(identificadores).where(eq(identificadores.pessoaId, p.id));
    expect(ids.map((i) => `${i.tipo}:${i.valor}`).sort()).toEqual(
      [`telefone:${tel.canonico}`, `wa_id:${tel.semNono}@c.us`].sort(),
    );

    let c = await contar(p.id);
    expect(c.mensagens).toHaveLength(2);
    const porId = new Map(c.mensagens.map((m) => [m.waMsgId, m]));
    expect(porId.get(recebidas[0].wa_msg_id)?.textoAbertura).toBe("Olá! Vi o anúncio");
    // A segunda recebida não abre conversa e não casa padrão: o texto é descartado.
    expect(porId.get(recebidas[1].wa_msg_id)?.textoAbertura).toBeNull();
    expect(
      c.mensagens.every((m) => m.numeroMonitorado === numero && m.dispositivoId === dispositivo.id),
    ).toBe(true);
    expect(c.eventos).toHaveLength(1);
    expect(c.eventos[0]).toMatchObject({
      tipo: "conversa_iniciada",
      canal: "whatsapp",
      origemId: null,
      numeroMonitorado: numero,
    });
    expect(c.eventos[0].ocorridoEm.getTime()).toBe(t0.getTime());
    expect(c.eventos[0].dados).toMatchObject({
      chat_id: `${tel.semNono}@c.us`,
      texto_abertura: "Olá! Vi o anúncio",
    });

    // Primeira resposta (out depois de in): vai para "Em conversa".
    const resposta = msg(tel, "B1", "out", new Date(t0.getTime() + 5 * MIN), "Oi Maria, tudo bem?");
    await ingerirWhatsapp(dispositivo, lote([resposta]));
    expect(await pessoaDe(tel)).toMatchObject({ estagio: "Em conversa" });
    c = await contar(p.id);
    expect(c.mensagens).toHaveLength(3);
    expect(c.mensagens.find((m) => m.waMsgId === resposta.wa_msg_id)?.textoAbertura).toBeNull();
    const mudancas = c.eventos.filter((e) => e.tipo === "estagio_alterado");
    expect(mudancas).toHaveLength(1);
    expect(mudancas[0]).toMatchObject({ canal: "whatsapp", usuarioId: null });
    expect(mudancas[0].dados).toMatchObject({
      automatico: true,
      de_nome: "Novo lead",
      para_nome: "Em conversa",
    });

    // Reenvio de tudo (e mais uma resposta): nada duplica e o estágio não muda de novo.
    const outra = msg(tel, "B2", "out", new Date(t0.getTime() + 6 * MIN));
    const r2 = await ingerirWhatsapp(dispositivo, lote([...recebidas, resposta, outra]));
    expect(r2.status).toBe(200);
    if (r2.status !== 200) return;
    expect(r2.corpo.aceitos).toHaveLength(4);
    const r3 = await ingerirWhatsapp(dispositivo, lote([...recebidas, resposta, outra]));
    expect(r3.corpo).toEqual(r2.corpo);
    c = await contar(p.id);
    expect(c.mensagens).toHaveLength(4);
    expect(c.eventos).toHaveLength(2);
    const entradas = await db
      .select({ status: entradasBrutas.status })
      .from(entradasBrutas)
      .where(like(entradasBrutas.chaveIdempotencia, `${numero}:%${tel.semNono}%`));
    expect(entradas).toHaveLength(4);
    expect(entradas.every((e) => e.status === "processado")).toBe(true);
    expect((await pessoaDe(tel)).ultimo?.getTime()).toBe(t0.getTime() + 6 * MIN);
  });

  it("texto que casa padrão cadastrado é mantido mesmo sem abrir conversa", async () => {
    await db
      .insert(origens)
      .values({
        codigo: codigoOrigem,
        nome: "Origem de teste",
        tipo: "link_whatsapp",
        padraoTexto: padrao,
      });
    const tel = celularAleatorio();
    const t0 = new Date(Date.now() - 60 * MIN);
    const itens = [
      msg(tel, "P1", "in", t0, "Oi"),
      msg(tel, "P2", "in", new Date(t0.getTime() + MIN), `${padrao.toUpperCase()} em Maceió`),
      msg(tel, "P3", "in", new Date(t0.getTime() + 2 * MIN), "outra coisa"),
    ];
    await ingerirWhatsapp(dispositivo, lote(itens));
    const p = await pessoaDe(tel);
    const { mensagens: ms, eventos: evs } = await contar(p.id);
    const texto = new Map(ms.map((m) => [m.waMsgId, m.textoAbertura]));
    expect(texto.get(itens[0].wa_msg_id)).toBe("Oi");
    expect(texto.get(itens[1].wa_msg_id)).toBe(`${padrao.toUpperCase()} em Maceió`);
    expect(texto.get(itens[2].wa_msg_id)).toBeNull();
    expect(evs.filter((e) => e.tipo === "conversa_iniciada")).toHaveLength(1);

    const hb = await registrarHeartbeat(dispositivo, {
      numero_monitorado: numero,
      versao_extensao: "0.1.1",
      fila_pendente: 7,
      ultimo_sync_em: null,
    });
    expect(hb.status).toBe(200);
    if (hb.status !== 200) return;
    expect(hb.corpo.padroes_texto).toContain(padrao);
  });

  it("nova recebida depois de 30 dias sem mensagens abre outra conversa", async () => {
    const tel = celularAleatorio();
    const t0 = new Date(Date.now() - 40 * DIA);
    await ingerirWhatsapp(
      dispositivo,
      lote([
        msg(tel, "J1", "in", t0, "Oi"),
        msg(tel, "J2", "in", new Date(t0.getTime() + 31 * DIA), "Voltei"),
      ]),
    );
    const p = await pessoaDe(tel);
    const { mensagens: ms, eventos: evs } = await contar(p.id);
    expect(ms.map((m) => m.textoAbertura).sort()).toEqual(["Oi", "Voltei"]);
    expect(evs.filter((e) => e.tipo === "conversa_iniciada")).toHaveLength(2);
    expect(p.estagio).toBe("Novo lead");
  });

  it("resposta que chega antes da recebida também move para Em conversa", async () => {
    const tel = celularAleatorio();
    const t0 = new Date(Date.now() - 30 * MIN);
    await ingerirWhatsapp(dispositivo, lote([msg(tel, "F2", "out", new Date(t0.getTime() + MIN))]));
    expect(await pessoaDe(tel)).toMatchObject({ estagio: "Novo lead" });
    await ingerirWhatsapp(dispositivo, lote([msg(tel, "F1", "in", t0, "Oi")]));
    const p = await pessoaDe(tel);
    expect(p.estagio).toBe("Em conversa");
    const { eventos: evs } = await contar(p.id);
    expect(evs.map((e) => e.tipo).sort()).toEqual(["conversa_iniciada", "estagio_alterado"]);
  });

  it("item inválido não derruba o lote; mais de 100 itens e número inválido dão 400", async () => {
    const tel = celularAleatorio();
    const valido = msg(tel, "V1", "in", new Date(Date.now() - MIN), "Oi");
    const invalido = { ...msg(tel, "V2", "in", new Date()), direcao: "x" };
    const r = await ingerirWhatsapp(dispositivo, lote([valido, invalido]));
    expect(r.status).toBe(200);
    if (r.status !== 200) return;
    expect(r.corpo.aceitos).toEqual([valido.wa_msg_id]);
    expect(r.corpo.erros).toHaveLength(1);
    expect(r.corpo.erros[0].wa_msg_id).toBe(invalido.wa_msg_id);
    expect(r.corpo.erros[0].motivo).toContain("direcao");

    const muitos = Array.from({ length: 101 }, (_, i) => msg(tel, `M${i}`, "in", new Date()));
    expect((await ingerirWhatsapp(dispositivo, lote(muitos))).status).toBe(400);
    expect(
      (
        await ingerirWhatsapp(dispositivo, {
          versao_extensao: "0.1.0",
          numero_monitorado: "123",
          itens: [],
        })
      ).status,
    ).toBe(400);
  });

  it("heartbeat atualiza o dispositivo e devolve o último sync do número", async () => {
    const sync = "2026-10-02T12:00:00.000Z";
    const hb = await registrarHeartbeat(dispositivo, {
      numero_monitorado: monitorado.semNono,
      versao_extensao: "0.2.0",
      fila_pendente: 3,
      ultimo_sync_em: sync,
    });
    expect(hb.status).toBe(200);
    if (hb.status !== 200) return;
    const todas = await db
      .select({ em: mensagens.enviadaEm })
      .from(mensagens)
      .where(eq(mensagens.numeroMonitorado, numero));
    const max = Math.max(...todas.map((m) => m.em.getTime()));
    expect(hb.corpo.ultimo_sync_servidor).toBe(new Date(max).toISOString());

    const [d] = await db.select().from(dispositivos).where(eq(dispositivos.id, dispositivo.id));
    expect(d).toMatchObject({ numeroDetectado: numero, filaPendente: 3, versaoExtensao: "0.2.0" });
    expect(d.ultimoSyncEm?.toISOString()).toBe(sync);
    expect(d.ultimoSinalEm).toBeInstanceOf(Date);
    const [n] = await db.select().from(numeros).where(eq(numeros.numero, numero));
    expect(n).toMatchObject({ apelido: null, papel: null });

    expect((await registrarHeartbeat(dispositivo, { numero_monitorado: numero })).status).toBe(400);
  });
});
