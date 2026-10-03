// Estado de execução do service worker: heartbeat, erro atual, backoff, último envio, trava.
//
// Fica em memória e é espelhado em chrome.storage.session, que sobrevive ao sono do service worker
// do MV3 (mas não a reiniciar o navegador, o que é desejável: depois de reiniciar, tenta de novo).
// O armazenamento é injetável para os testes de envio rodarem em Node.
import type { ErroExecucao } from "../shared/protocol";

export interface UltimoEnvio {
  quando: string;
  aceitos: number;
  rejeitados: number;
}

export interface EstadoExecucao {
  ultimo_heartbeat_em: string | null;
  ultimo_sync_servidor: string | null;
  padroes_texto: string[];
  ultimo_erro: ErroExecucao | null;
  /** 401 recebido: nada é enviado até a configuração mudar. */
  token_invalido: boolean;
  /** Backoff: nenhum envio antes deste instante (ISO), ou null. */
  proximo_envio_em: string | null;
  falhas_seguidas: number;
  ultimo_envio: UltimoEnvio | null;
  /** Trava da rodada de envio: carimbo (ms) de quando começou, ou null. Expira em 2 min. */
  envio_em_andamento_desde: number | null;
}

export const ESTADO_INICIAL: EstadoExecucao = {
  ultimo_heartbeat_em: null,
  ultimo_sync_servidor: null,
  padroes_texto: [],
  ultimo_erro: null,
  token_invalido: false,
  proximo_envio_em: null,
  falhas_seguidas: 0,
  ultimo_envio: null,
  envio_em_andamento_desde: null,
};

const CHAVE = "execucao";

/** Onde o estado é persistido (chrome.storage.session no service worker, memória nos testes). */
export interface ArmazenamentoSessao {
  ler(): Promise<Partial<EstadoExecucao> | null>;
  gravar(estado: EstadoExecucao): Promise<void>;
}

export function armazenamentoChromeSession(): ArmazenamentoSessao {
  return {
    async ler() {
      try {
        const dados = await chrome.storage.session.get(CHAVE);
        const v: unknown = dados[CHAVE];
        return v && typeof v === "object" ? (v as Partial<EstadoExecucao>) : null;
      } catch (erro) {
        console.warn("[PIOLHO] não consegui ler o estado da sessão", erro);
        return null;
      }
    },
    async gravar(estado) {
      try {
        await chrome.storage.session.set({ [CHAVE]: estado });
      } catch (erro) {
        console.warn("[PIOLHO] não consegui gravar o estado da sessão", erro);
      }
    },
  };
}

export function armazenamentoMemoria(inicial: Partial<EstadoExecucao> | null = null): ArmazenamentoSessao & {
  atual: Partial<EstadoExecucao> | null;
} {
  return {
    atual: inicial,
    async ler() {
      return this.atual ? { ...this.atual } : null;
    },
    async gravar(estado) {
      this.atual = { ...estado };
    },
  };
}

/** Estado em memória com espelho persistente. Uma instância por service worker. */
export class EstadoDeExecucao {
  private estado: EstadoExecucao = { ...ESTADO_INICIAL };
  private carregado: Promise<void> | null = null;

  constructor(private readonly armazenamento: ArmazenamentoSessao) {}

  private carregar(): Promise<void> {
    if (!this.carregado) {
      this.carregado = this.armazenamento.ler().then((salvo) => {
        if (salvo) this.estado = { ...ESTADO_INICIAL, ...salvo };
      });
    }
    return this.carregado;
  }

  async ler(): Promise<EstadoExecucao> {
    await this.carregar();
    return { ...this.estado };
  }

  async atualizar(parcial: Partial<EstadoExecucao>): Promise<EstadoExecucao> {
    await this.carregar();
    this.estado = { ...this.estado, ...parcial };
    await this.armazenamento.gravar(this.estado);
    return { ...this.estado };
  }

  async registrarErro(tipo: ErroExecucao["tipo"], mensagem: string, agora: number = Date.now()): Promise<void> {
    await this.atualizar({ ultimo_erro: { quando: new Date(agora).toISOString(), tipo, mensagem: mensagem.slice(0, 1000) } });
  }
}
