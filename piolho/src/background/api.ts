// Cliente HTTP do Sistema de Leads, usado só pelo service worker.
//
// Contrato: seção "API de ingestão" do sistema-leads/CLAUDE.md (implementação real em
// sistema-leads/src/nucleo/ingestao-whatsapp.ts). Toda chamada leva
// `Authorization: Bearer <token>` e devolve um Resultado classificado:
// - ok: 200 com corpo no formato esperado;
// - token_invalido: 401 (parar de enviar até a configuração mudar);
// - erro_cliente: outro 4xx (com o corpo, para diagnóstico);
// - erro_servidor: 5xx (tentar de novo com backoff);
// - rede: fetch falhou ou passou do tempo limite (tentar de novo com backoff);
// - resposta_invalida: 200 com corpo fora do contrato (tratado como erro do servidor).
// O token NUNCA entra em log, mensagem de erro ou resultado.
import {
  respostaHeartbeatSchema,
  respostaIngestaoSchema,
  type Heartbeat,
  type LoteIngestao,
  type RespostaHeartbeat,
  type RespostaIngestao,
  type TipoErro,
} from "../shared/protocol";

/** Tempo limite de cada chamada. */
export const TIMEOUT_API_MS = 20_000;

export const ROTAS = {
  heartbeat: "/api/ingest/heartbeat",
  whatsapp: "/api/ingest/whatsapp",
} as const;

export interface ConfigApi {
  urlSistema: string;
  token: string;
}

export type Resultado<T> =
  | { tipo: "ok"; status: number; dados: T }
  | { tipo: Exclude<TipoErro, "resposta_invalida">; status: number | null; mensagem: string; corpo?: unknown }
  | { tipo: "resposta_invalida"; status: number; mensagem: string; corpo?: unknown };

export type Falha = Exclude<Resultado<unknown>, { tipo: "ok" }>;

/** fetch injetável (testes usam um falso). */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface Validador<T> {
  safeParse(v: unknown): { success: true; data: T } | { success: false };
}

/** Lê o corpo como JSON; se não for JSON, devolve o texto (cortado). Nunca lança. */
async function lerCorpo(resposta: Response): Promise<unknown> {
  let texto: string;
  try {
    texto = await resposta.text();
  } catch {
    return null;
  }
  try {
    return JSON.parse(texto);
  } catch {
    return texto.slice(0, 500);
  }
}

/** Texto curto do corpo de erro do servidor ({ erro: "..." }) para mostrar no painel. */
function resumoCorpo(corpo: unknown): string {
  if (corpo && typeof corpo === "object" && typeof (corpo as { erro?: unknown }).erro === "string") {
    return (corpo as { erro: string }).erro.slice(0, 300);
  }
  if (typeof corpo === "string" && corpo.trim()) return corpo.trim().slice(0, 300);
  return "";
}

/**
 * Faz a chamada e classifica. Função exportada para os testes (com fetch falso).
 * Nunca lança: qualquer exceção vira `rede`.
 */
export async function chamar<T>(
  cfg: ConfigApi,
  rota: string,
  corpo: unknown,
  validador: Validador<T>,
  opcoes: { fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<Resultado<T>> {
  const fazerFetch: FetchLike = opcoes.fetch ?? ((url, init) => fetch(url, init));
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), opcoes.timeoutMs ?? TIMEOUT_API_MS);
  let resposta: Response;
  try {
    resposta = await fazerFetch(`${cfg.urlSistema}${rota}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(corpo),
      signal: controlador.signal,
      // Sem cookies do sistema: a autenticação é só pelo token do dispositivo.
      credentials: "omit",
      cache: "no-store",
    });
  } catch (erro) {
    clearTimeout(limite);
    const abortado = controlador.signal.aborted;
    const detalhe = erro instanceof Error && erro.message ? erro.message : String(erro);
    return {
      tipo: "rede",
      status: null,
      mensagem: abortado
        ? `Sem resposta do sistema em ${Math.round((opcoes.timeoutMs ?? TIMEOUT_API_MS) / 1000)} s.`
        : `Sem conexão com o sistema (${detalhe.slice(0, 200)}).`,
    };
  }
  let corpoResposta: unknown;
  try {
    corpoResposta = await lerCorpo(resposta);
  } finally {
    clearTimeout(limite);
  }
  return classificar(resposta.status, corpoResposta, validador);
}

/** Classifica status + corpo. Pura, exportada para os testes. */
export function classificar<T>(status: number, corpo: unknown, validador: Validador<T>): Resultado<T> {
  const resumo = resumoCorpo(corpo);
  if (status === 401) {
    return { tipo: "token_invalido", status, mensagem: "Token inválido (401).", corpo };
  }
  if (status >= 200 && status < 300) {
    const r = validador.safeParse(corpo);
    if (r.success) return { tipo: "ok", status, dados: r.data };
    return { tipo: "resposta_invalida", status, mensagem: "Resposta do sistema fora do formato esperado.", corpo };
  }
  if (status >= 400 && status < 500) {
    return { tipo: "erro_cliente", status, mensagem: `Erro ${status}${resumo ? `: ${resumo}` : ""}`, corpo };
  }
  if (status >= 500) {
    return { tipo: "erro_servidor", status, mensagem: `Erro ${status} no sistema${resumo ? `: ${resumo}` : ""}`, corpo };
  }
  // 1xx/3xx inesperados (fetch segue redirecionamentos sozinho).
  return { tipo: "erro_servidor", status, mensagem: `Resposta inesperada do sistema (${status}).`, corpo };
}

/** POST /api/ingest/heartbeat. */
export function enviarHeartbeat(
  cfg: ConfigApi,
  corpo: Heartbeat,
  opcoes?: { fetch?: FetchLike; timeoutMs?: number },
): Promise<Resultado<RespostaHeartbeat>> {
  return chamar(cfg, ROTAS.heartbeat, corpo, respostaHeartbeatSchema, opcoes);
}

/** POST /api/ingest/whatsapp (até 100 itens). */
export function enviarLote(
  cfg: ConfigApi,
  lote: LoteIngestao,
  opcoes?: { fetch?: FetchLike; timeoutMs?: number },
): Promise<Resultado<RespostaIngestao>> {
  return chamar(cfg, ROTAS.whatsapp, lote, respostaIngestaoSchema, opcoes);
}
