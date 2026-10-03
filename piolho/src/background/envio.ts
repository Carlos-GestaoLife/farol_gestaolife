// Envio da fila ao servidor e heartbeat (service worker).
//
// esvaziarFila(numero): rodadas de lotes de até 100 itens do número, em ordem cronológica.
// - ok: remove os `aceitos` da fila (e avança o checkpoint), move os `erros` para rejeitados;
//   itens que o servidor não citou (erro sem wa_msg_id) são reenviados um a um para isolar.
// - token_invalido (401): para e marca; nada mais sai até a configuração mudar.
// - rede, erro_servidor (5xx) ou resposta fora do contrato: para, mantém tudo na fila e aplica o
//   backoff exponencial (1, 2, 4, 5, 5... min), persistido em proximo_envio_em.
// - erro_cliente (4xx que não 401): registra e reenvia item a item UMA vez para isolar o item
//   ruim (rejeitado sozinho), mantendo os demais. Se TODOS falharem do mesmo jeito, o problema é
//   do lote (envelope), não de um item: nada é rejeitado, tudo fica na fila com backoff.
// Uma rodada por vez: promessa em memória e carimbo em storage.session (expira em 2 min, para o
// caso de o worker dormir no meio de uma rodada).
import { calcularBackoffMs } from "./backoff";
import { maiorEnviadaEm } from "./checkpoint";
import type { ConfigApi, Falha, Resultado } from "./api";
import type { EstadoDeExecucao } from "./estado-execucao";
import type { ErroRejeicao, Fila } from "./fila";
import {
  LIMITES,
  type Heartbeat,
  type ItemMensagem,
  type LoteIngestao,
  type RespostaHeartbeat,
  type RespostaIngestao,
} from "../shared/protocol";

/** Validade do carimbo da trava de envio. */
export const TRAVA_EXPIRA_MS = 2 * 60_000;
/** Teto de lotes numa rodada (100 x 50 = 5000 itens), para uma rodada nunca ficar presa. */
export const MAX_LOTES_POR_RODADA = 50;

export interface DepsEnvio {
  fila: Fila;
  estado: EstadoDeExecucao;
  lerConfig(): Promise<ConfigApi | null>;
  enviarLote(cfg: ConfigApi, lote: LoteIngestao): Promise<Resultado<RespostaIngestao>>;
  enviarHeartbeat(cfg: ConfigApi, corpo: Heartbeat): Promise<Resultado<RespostaHeartbeat>>;
  lerCheckpoint(numero: string): Promise<string | null>;
  avancarCheckpoint(numero: string, iso: string): Promise<void>;
  versaoExtensao: string;
  agora?: () => number;
}

export type MotivoFim =
  | "fila_vazia"
  | "sem_config"
  | "token_invalido"
  | "backoff"
  | "em_andamento"
  | "falha"
  | "sem_progresso"
  | "limite_rodada";

export interface ResumoRodada {
  motivo: MotivoFim;
  lotes: number;
  aceitos: number;
  rejeitados: number;
}

type Decisao = "seguir" | "parar";

export class Enviador {
  private rodadaAtual: Promise<ResumoRodada> | null = null;
  private heartbeatAtual: Promise<Resultado<RespostaHeartbeat> | null> | null = null;

  constructor(private readonly deps: DepsEnvio) {}

  private agora(): number {
    return this.deps.agora ? this.deps.agora() : Date.now();
  }

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  /**
   * POST /api/ingest/heartbeat com fila_pendente = tamanho(numero) e ultimo_sync_em = checkpoint.
   * Devolve null quando nem tenta (sem configuração ou token já marcado como inválido).
   */
  heartbeat(numero: string): Promise<Resultado<RespostaHeartbeat> | null> {
    if (!this.heartbeatAtual) {
      this.heartbeatAtual = this.fazerHeartbeat(numero).finally(() => {
        this.heartbeatAtual = null;
      });
    }
    return this.heartbeatAtual;
  }

  private async fazerHeartbeat(numero: string): Promise<Resultado<RespostaHeartbeat> | null> {
    const cfg = await this.deps.lerConfig();
    if (!cfg) return null;
    if ((await this.deps.estado.ler()).token_invalido) return null;
    const corpo: Heartbeat = {
      numero_monitorado: numero,
      versao_extensao: this.deps.versaoExtensao.slice(0, LIMITES.versaoExtensao),
      fila_pendente: await this.deps.fila.tamanho(numero),
      ultimo_sync_em: await this.deps.lerCheckpoint(numero),
    };
    const r = await this.deps.enviarHeartbeat(cfg, corpo);
    const agoraIso = new Date(this.agora()).toISOString();
    if (r.tipo === "ok") {
      await this.deps.estado.atualizar({
        ultimo_heartbeat_em: agoraIso,
        ultimo_sync_servidor: r.dados.ultimo_sync_servidor,
        padroes_texto: r.dados.padroes_texto,
        token_invalido: false,
        ultimo_erro: null,
      });
    } else {
      await this.registrarFalha(r, "heartbeat");
    }
    return r;
  }

  // -------------------------------------------------------------------------
  // Envio da fila
  // -------------------------------------------------------------------------

  /** Esvazia a fila do número. Se já há uma rodada em andamento, devolve a mesma promessa. */
  esvaziarFila(numero: string, opcoes: { ignorarBackoff?: boolean } = {}): Promise<ResumoRodada> {
    if (!this.rodadaAtual) {
      this.rodadaAtual = this.rodada(numero, opcoes).finally(() => {
        this.rodadaAtual = null;
      });
    }
    return this.rodadaAtual;
  }

  private async rodada(numero: string, opcoes: { ignorarBackoff?: boolean }): Promise<ResumoRodada> {
    const resumo: ResumoRodada = { motivo: "fila_vazia", lotes: 0, aceitos: 0, rejeitados: 0 };
    const cfg = await this.deps.lerConfig();
    if (!cfg) return { ...resumo, motivo: "sem_config" };
    const est = await this.deps.estado.ler();
    if (est.token_invalido) return { ...resumo, motivo: "token_invalido" };
    if (!opcoes.ignorarBackoff && est.proximo_envio_em && this.agora() < Date.parse(est.proximo_envio_em)) {
      return { ...resumo, motivo: "backoff" };
    }
    // Carimbo de outra vida do worker ainda válido: espera expirar.
    if (est.envio_em_andamento_desde !== null && this.agora() - est.envio_em_andamento_desde < TRAVA_EXPIRA_MS) {
      return { ...resumo, motivo: "em_andamento" };
    }
    await this.deps.estado.atualizar({ envio_em_andamento_desde: this.agora() });
    try {
      for (let i = 0; i < MAX_LOTES_POR_RODADA; i++) {
        const lote = await this.deps.fila.proximoLote(numero, LIMITES.itensPorLote);
        if (lote.length === 0) return resumo;
        resumo.lotes++;
        const antes = resumo.aceitos + resumo.rejeitados;
        const decisao = await this.enviarUmLote(cfg, numero, lote, resumo);
        if (decisao === "parar") {
          const e = await this.deps.estado.ler();
          resumo.motivo = e.token_invalido ? "token_invalido" : "falha";
          return resumo;
        }
        if (resumo.aceitos + resumo.rejeitados === antes) {
          resumo.motivo = "sem_progresso";
          return resumo;
        }
      }
      resumo.motivo = "limite_rodada";
      return resumo;
    } finally {
      await this.deps.estado.atualizar({ envio_em_andamento_desde: null });
    }
  }

  private montarLote(numero: string, itens: ItemMensagem[]): LoteIngestao {
    return {
      versao_extensao: this.deps.versaoExtensao.slice(0, LIMITES.versaoExtensao),
      numero_monitorado: numero,
      itens,
    };
  }

  private async enviarUmLote(
    cfg: ConfigApi,
    numero: string,
    lote: ItemMensagem[],
    resumo: ResumoRodada,
  ): Promise<Decisao> {
    const r = await this.deps.enviarLote(cfg, this.montarLote(numero, lote));
    if (r.tipo === "ok") {
      const naoCitados = await this.aplicarResposta(numero, lote, r.dados, resumo);
      await this.registrarSucesso(resumo);
      // Erro sem wa_msg_id: o servidor não disse qual item era. Isola um a um.
      if (naoCitados.length > 0) return this.isolar(cfg, numero, naoCitados, resumo);
      return "seguir";
    }
    if (r.tipo === "erro_cliente") {
      await this.registrarFalha(r, "envio");
      return this.isolar(cfg, numero, lote, resumo);
    }
    await this.registrarFalha(r, "envio");
    return "parar";
  }

  /**
   * Aplica uma resposta 200: confirma aceitos, rejeita os citados em `erros`.
   * Devolve os itens que o servidor não citou em nenhum dos dois.
   */
  private async aplicarResposta(
    numero: string,
    itens: ItemMensagem[],
    resposta: RespostaIngestao,
    resumo: ResumoRodada,
  ): Promise<ItemMensagem[]> {
    const doLote = new Set(itens.map((i) => i.wa_msg_id));
    const aceitos = new Set(resposta.aceitos.filter((id) => doLote.has(id)));
    const rejeicoes: ErroRejeicao[] = [];
    for (const e of resposta.erros) {
      if (e.wa_msg_id !== null && doLote.has(e.wa_msg_id) && !aceitos.has(e.wa_msg_id)) {
        rejeicoes.push({ wa_msg_id: e.wa_msg_id, motivo: e.motivo });
      }
    }
    if (aceitos.size > 0) {
      await this.deps.fila.confirmarAceitos(numero, [...aceitos]);
      const maior = maiorEnviadaEm(itens.filter((i) => aceitos.has(i.wa_msg_id)));
      if (maior) await this.deps.avancarCheckpoint(numero, maior);
    }
    if (rejeicoes.length > 0) await this.deps.fila.marcarErroDefinitivo(numero, rejeicoes);
    resumo.aceitos += aceitos.size;
    resumo.rejeitados += rejeicoes.length;
    const rejeitados = new Set(rejeicoes.map((r) => r.wa_msg_id));
    return itens.filter((i) => !aceitos.has(i.wa_msg_id) && !rejeitados.has(i.wa_msg_id));
  }

  /** Reenvia item a item uma vez, para isolar o item ruim. */
  private async isolar(
    cfg: ConfigApi,
    numero: string,
    itens: ItemMensagem[],
    resumo: ResumoRodada,
  ): Promise<Decisao> {
    let algumOk = false;
    const falhasCliente: ErroRejeicao[] = [];
    for (const item of itens) {
      const r = await this.deps.enviarLote(cfg, this.montarLote(numero, [item]));
      if (r.tipo === "ok") {
        algumOk = true;
        const resto = await this.aplicarResposta(numero, [item], r.dados, resumo);
        if (resto.length > 0) {
          await this.deps.fila.marcarErroDefinitivo(numero, [
            { wa_msg_id: item.wa_msg_id, motivo: "O servidor não confirmou o item nem informou o erro." },
          ]);
          resumo.rejeitados++;
        }
        continue;
      }
      if (r.tipo === "erro_cliente") {
        falhasCliente.push({ wa_msg_id: item.wa_msg_id, motivo: r.mensagem });
        continue;
      }
      // 401, rede ou 5xx no meio do isolamento: para; o que sobrou continua na fila.
      await this.registrarFalha(r, "envio");
      return "parar";
    }
    if (falhasCliente.length === 0) {
      await this.registrarSucesso(resumo);
      return "seguir";
    }
    if (!algumOk) {
      // Todos recusados com 4xx: problema do lote (envelope, versão, número), não de um item.
      // Nada é descartado: tudo fica na fila e o envio volta com backoff.
      await this.aplicarBackoff();
      return "parar";
    }
    await this.deps.fila.marcarErroDefinitivo(numero, falhasCliente);
    resumo.rejeitados += falhasCliente.length;
    return "seguir";
  }

  // -------------------------------------------------------------------------
  // Estado
  // -------------------------------------------------------------------------

  private async registrarSucesso(resumo: ResumoRodada): Promise<void> {
    await this.deps.estado.atualizar({
      falhas_seguidas: 0,
      proximo_envio_em: null,
      ultimo_erro: null,
      ultimo_envio: {
        quando: new Date(this.agora()).toISOString(),
        aceitos: resumo.aceitos,
        rejeitados: resumo.rejeitados,
      },
    });
  }

  private async aplicarBackoff(): Promise<void> {
    const est = await this.deps.estado.ler();
    const falhas = est.falhas_seguidas + 1;
    await this.deps.estado.atualizar({
      falhas_seguidas: falhas,
      proximo_envio_em: new Date(this.agora() + calcularBackoffMs(falhas)).toISOString(),
    });
  }

  private async registrarFalha(r: Falha, origem: "envio" | "heartbeat"): Promise<void> {
    const prefixo = origem === "heartbeat" ? "Heartbeat" : "Envio";
    await this.deps.estado.registrarErro(r.tipo, `${prefixo}: ${r.mensagem}`, this.agora());
    if (r.tipo === "token_invalido") {
      await this.deps.estado.atualizar({ token_invalido: true });
      return;
    }
    // Backoff só no envio; o heartbeat tenta de novo no próximo minuto.
    if (origem === "envio" && r.tipo !== "erro_cliente") await this.aplicarBackoff();
  }
}
