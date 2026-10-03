// Único arquivo do piolho que fala com o wa-js (window.WPP). Roda no MAIN world.
//
// Regras (herdadas da extensão de referência, github.com/Carlos-GestaoLife/extrator_contatos):
// - Só leitura. Nada aqui envia mensagem, marca como lida ou entra em grupo.
// - window.WPP é lido de forma preguiçosa a cada chamada (função wpp()). Nunca guardar a referência
//   num const de módulo: o wa-js pode terminar de carregar depois.
// - APIs conferidas nos tipos do wa-js 4.6.0 (ver vendor/wa-js/VERSION.md) e já usadas na extensão
//   de referência. A interface WppMinimo descreve só o que usamos, com tipos frouxos onde o
//   WhatsApp pode variar. Antes de usar uma API nova, confirmar na versão vendorizada.
import { LIMITES, mensagemDeErro, type EstadoWhatsapp, type ItemMensagem } from "../shared/protocol";
import { classificarId, extrairDigitos, telefoneDeId } from "../shared/phone";
import { montarItem, type ContatoBruto, type MensagemBruta } from "./extracao";
import { resolverLid, type ContatoLike, type PnLidEntry, type WidLike } from "./lid";

// ---------------------------------------------------------------------------
// Interface mínima do wa-js
// ---------------------------------------------------------------------------

interface WppMinimo {
  isReady?: boolean;
  /** Emissor de eventos do wa-js (WPP.on / WPP.off). Ver docs/WA-JS.md. */
  on?: (evento: string, ouvinte: (...args: unknown[]) => void) => unknown;
  off?: (evento: string, ouvinte: (...args: unknown[]) => void) => unknown;
  loader?: { onReady?: (listener: () => void, delay?: number) => void };
  conn: {
    isAuthenticated(): boolean;
    isMainReady(): boolean;
    getMyUserId(): WidLike | undefined;
  };
  contact: {
    get(id: string | WidLike): Promise<ContatoLike | undefined>;
    getPnLidEntry(id: string | WidLike): Promise<PnLidEntry | undefined>;
  };
  whatsapp?: {
    functions?: { getPhoneNumber?: (wid: WidLike) => unknown };
  };
}

/** Lê window.WPP na hora. Nunca guardar o retorno em variável de módulo. */
function wpp(): WppMinimo | undefined {
  return (window as unknown as { WPP?: WppMinimo }).WPP;
}

function exigirWppPronto(): WppMinimo {
  const w = wpp();
  if (!w) throw new Error("wa-js não foi injetado");
  if (!w.isReady) throw new Error("O WhatsApp ainda não terminou de carregar.");
  return w;
}

// ---------------------------------------------------------------------------
// Etapa 1: prontidão, estado e número próprio
// ---------------------------------------------------------------------------

/** wa-js injetado e com os módulos do WhatsApp carregados (WPP.isReady). Nunca lança. */
export function estaPronto(): boolean {
  try {
    return !!wpp()?.isReady;
  } catch {
    return false;
  }
}

/**
 * Espera o wa-js ficar pronto. Usa WPP.loader.onReady quando existe e, por garantia, consulta
 * WPP.isReady a cada 500 ms. Resolve true quando pronto, ou false se passar do tempo limite.
 */
export function aguardarPronto(timeoutMs: number = 30_000): Promise<boolean> {
  if (estaPronto()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let encerrado = false;
    const concluir = (pronto: boolean) => {
      if (encerrado) return;
      encerrado = true;
      clearInterval(intervalo);
      clearTimeout(limite);
      resolve(pronto);
    };
    const intervalo = setInterval(() => {
      if (estaPronto()) concluir(true);
    }, 500);
    const limite = setTimeout(() => concluir(estaPronto()), timeoutMs);
    try {
      wpp()?.loader?.onReady?.(() => concluir(true));
    } catch {
      // Sem loader: fica só a consulta periódica.
    }
  });
}

/**
 * Número da conta logada na forma canônica (13 dígitos para celular brasileiro), ou null se o
 * WhatsApp ainda não sabe (antes do login) ou se o id próprio não for "@c.us".
 * API: WPP.conn.getMyUserId(), a mesma confirmada no adapter da extensão de referência.
 */
export function meuNumero(): string | null {
  try {
    const id = wpp()?.conn.getMyUserId()?._serialized;
    return typeof id === "string" ? extrairDigitos(id) : null;
  } catch {
    return null;
  }
}

/** Estado completo da aba para publicar na ponte. Síncrono e nunca lança. */
export function lerEstado(erro: string | null = null): EstadoWhatsapp {
  const w = wpp();
  if (!w) {
    return {
      wpp_pronto: false,
      autenticado: false,
      sincronizado: false,
      numero_proprio: null,
      erro: erro ?? "wa-js não foi injetado",
    };
  }
  try {
    const wppPronto = !!w.isReady;
    const autenticado = wppPronto && !!w.conn.isAuthenticated();
    const sincronizado = autenticado && !!w.conn.isMainReady();
    return {
      wpp_pronto: wppPronto,
      autenticado,
      sincronizado,
      numero_proprio: autenticado ? meuNumero() : null,
      erro: wppPronto ? null : erro,
    };
  } catch (err) {
    return {
      wpp_pronto: false,
      autenticado: false,
      sincronizado: false,
      numero_proprio: null,
      erro: mensagemDeErro(err).slice(0, LIMITES.mensagemErro),
    };
  }
}

// ---------------------------------------------------------------------------
// Resolução de telefone (usada pela extração)
// ---------------------------------------------------------------------------

/**
 * Telefone canônico de um contato "@lid", pela resolução best-effort de lid.ts; null se o
 * WhatsApp não expõe o número. Para "@c.us" devolve os dígitos do próprio id.
 */
export async function resolverTelefone(id: string): Promise<string | null> {
  const tipo = classificarId(id);
  if (tipo === "c.us") return telefoneDeId(id);
  if (tipo !== "lid") return null;
  const w = exigirWppPronto();
  let contato: ContatoLike | undefined;
  try {
    contato = (await w.contact.get(id)) ?? undefined;
  } catch {
    contato = undefined;
  }
  const { telefoneSerializado } = await resolverLid(
    {
      getPhoneNumber: (wid) => w.whatsapp?.functions?.getPhoneNumber?.(wid),
      getPnLidEntry: (lid) => w.contact.getPnLidEntry(lid),
    },
    { _serialized: id },
    contato,
  );
  return telefoneDeId(id, telefoneSerializado ?? null);
}

// ---------------------------------------------------------------------------
// Etapa 4: escuta ao vivo
// ---------------------------------------------------------------------------

/** Objeto de mensagem do WhatsApp (MsgModel), na forma frouxa usada por extracao.ts. */
export type MensagemWhatsapp = MensagemBruta;

/** Evento do wa-js 4.6.0 para mensagem nova (recebida ou enviada). Evidência em docs/WA-JS.md. */
export const EVENTO_MENSAGEM_NOVA = "chat.new_message";

/** Contato do chat pela store local (WPP.contact.get). Nunca lança. */
async function obterContato(id: string): Promise<ContatoBruto | undefined> {
  try {
    return ((await wpp()?.contact.get(id)) as ContatoBruto | undefined) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Escuta mensagens novas de conversas individuais, recebidas e enviadas, e entrega cada uma já
 * convertida em ItemMensagem (extracao.montarItem aplica os filtros: grupos, status, canais,
 * listas de transmissão, notificações e chat próprio ficam de fora).
 *
 * Evento: WPP.on("chat.new_message"). No wa-js 4.6.0 ele é emitido a partir de
 * MsgStore.on("add") para toda mensagem com isNewMsg, sem filtrar fromMe; a doc do wa-js mostra
 * o uso com msg.fromMe para "enviei/recebi". Se dispara para as enviadas PELO CELULAR é
 * confirmação prática da Etapa 5 (docs/WA-JS.md).
 * Precisa do WPP pronto. Devolve a função que cancela a escuta.
 */
export function aoReceberMensagem(cb: (item: ItemMensagem) => void): () => void {
  const w = exigirWppPronto();
  if (typeof w.on !== "function") throw new Error("WPP.on indisponível nesta versão do wa-js.");
  const ouvinte = (...args: unknown[]) => {
    const msg = args[0] as MensagemBruta;
    void montarItem(msg, meuNumero(), resolverTelefoneSeguro, obterContato)
      .then((item) => {
        if (item) cb(item);
      })
      .catch((erro: unknown) => console.warn("[PIOLHO] falha ao montar item", mensagemDeErro(erro)));
  };
  w.on(EVENTO_MENSAGEM_NOVA, ouvinte);
  return () => {
    try {
      wpp()?.off?.(EVENTO_MENSAGEM_NOVA, ouvinte);
    } catch {
      // wa-js recarregado: nada a cancelar.
    }
  };
}

/** resolverTelefone que nunca lança (para a extração ao vivo). */
async function resolverTelefoneSeguro(id: string): Promise<string | null> {
  try {
    return await resolverTelefone(id);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// TODO das próximas etapas (só as assinaturas)
// ---------------------------------------------------------------------------

function naoImplementado(etapa: number): never {
  throw new Error(`Não implementado (TODO Etapa ${etapa}).`);
}

/**
 * TODO Etapa 7: listar as conversas individuais (@c.us e @lid, sem grupos, status, canais e
 * listas de transmissão) com última mensagem depois de `desde`.
 */
export async function listarChatsIndividuais(_desde: Date): Promise<{ chatId: string; ultimaEm: Date }[]> {
  return naoImplementado(7);
}

/** TODO Etapa 7: carregar as mensagens de um chat até alcançar `desde` (checkpoint). */
export async function carregarMensagensDesde(_chatId: string, _desde: Date): Promise<ItemMensagem[]> {
  return naoImplementado(7);
}

/**
 * TODO Etapa 6: extrair o contexto do anúncio de clique para WhatsApp. Os nomes dos campos só
 * entram aqui depois de confirmados na Etapa 5 e registrados em docs/CTWA.md.
 */
export function extrairCtwa(_msg: MensagemWhatsapp): Record<string, unknown> | null {
  return naoImplementado(6);
}
