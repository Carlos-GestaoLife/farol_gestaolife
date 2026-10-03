// Regra do texto_abertura (Etapa 6). Funções puras, testadas em tests/abertura.test.ts.
//
// Regra "sem conteúdo": o texto de uma mensagem só sai do WhatsApp quando ela é RECEBIDA, de texto
// (type "chat") e:
//   (a) abre conversa: nenhuma mensagem naquele chat nos 30 dias anteriores; ou
//   (b) o texto normalizado casa com um dos padroes_texto do heartbeat (igual ou "começa com").
// Fora disso, texto_abertura é null. O servidor aplica a mesma regra de novo
// (sistema-leads/src/nucleo/whatsapp.ts, deveManterTextoAbertura) e descarta o que não cumprir.
//
// Quem decide (a) é quem tem o histórico do chat (MAIN world): ao vivo pelo adapter
// (ultimaMensagemAntes) e na varredura pelo próprio histórico carregado. Se o histórico local não
// basta para afirmar, a resposta é "nao_sei" e vale só a regra (b).
import { LIMITES } from "../shared/protocol";
import { casaAlgumPadrao, cortarTexto } from "../shared/texto";

/** Janela de abertura de conversa, igual à do servidor (JANELA_CONVERSA_DIAS). */
export const JANELA_ABERTURA_DIAS = 30;
export const JANELA_ABERTURA_SEG = JANELA_ABERTURA_DIAS * 24 * 60 * 60;

export type Abertura = "abre" | "nao_abre" | "nao_sei";

/**
 * Decide se a mensagem de instante `t` (unix em segundos) abre a conversa.
 * @param anteriorT instante da mensagem anterior do chat (já sem notificações), ou null se não há
 *   nenhuma anterior no histórico local.
 * @param semMaisHistorico o histórico local acabou (não há mensagens mais antigas para carregar).
 *   Só com isso a falta de mensagem anterior prova a abertura.
 *
 * Igual ao servidor: uma anterior com até 30 dias (inclusive) impede a abertura.
 */
export function avaliarAbertura(t: number, anteriorT: number | null, semMaisHistorico: boolean): Abertura {
  if (anteriorT !== null) return t - anteriorT > JANELA_ABERTURA_SEG ? "abre" : "nao_abre";
  return semMaisHistorico ? "abre" : "nao_sei";
}

export interface EntradaTextoAbertura {
  /** Mensagem enviada por esta conta. */
  enviada: boolean;
  /** type do WhatsApp ("chat" é texto). */
  tipo: unknown;
  /** Corpo da mensagem: só é lido aqui, e só sai se a regra permitir. */
  texto: unknown;
  abertura: Abertura;
  padroes: readonly string[];
}

/** Texto a mandar em texto_abertura (cortado em 300 sem partir emoji), ou null. */
export function decidirTextoAbertura(e: EntradaTextoAbertura): string | null {
  if (e.enviada || e.tipo !== "chat" || typeof e.texto !== "string") return null;
  if (e.texto.trim() === "") return null;
  const pode = e.abertura === "abre" || casaAlgumPadrao(e.texto, e.padroes);
  return pode ? cortarTexto(e.texto, LIMITES.textoAbertura) : null;
}

/** Precisa avaliar a regra (a)? Só para recebida de texto (evita consultar o histórico à toa). */
export function precisaAvaliarAbertura(enviada: boolean, tipo: unknown): boolean {
  return !enviada && tipo === "chat";
}
