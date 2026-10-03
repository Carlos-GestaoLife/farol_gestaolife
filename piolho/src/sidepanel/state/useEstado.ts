// Consulta o service worker a cada 2 s: traduz o último estado do WhatsApp para o banner e traz
// o status do envio (heartbeat, fila, rejeitados, último envio, erro).
import { useCallback, useEffect, useState } from "react";
import type { RespostaObterEstado, StatusPiolho } from "../../shared/protocol";
import { obterEstado } from "../ponte";

export type SituacaoConexao = "desconectado" | "carregando" | "falha_wajs" | "nao_autenticado" | "conectado";

export interface Conexao {
  situacao: SituacaoConexao;
  /** Texto principal, em pt-BR. */
  texto: string;
  /** Número detectado (forma canônica), quando conectado. */
  numero: string | null;
  /** Detalhe técnico opcional (por exemplo, o erro informado pelo wa-js). */
  tecnico?: string;
}

const INTERVALO_MS = 2000;
/** Estado mais velho que isso é tratado como desconectado (o MAIN world republica a cada 15 s). */
export const VALIDADE_ESTADO_MS = 45_000;

export const TEXTOS: Record<SituacaoConexao, string> = {
  desconectado: "Desconectado do WhatsApp. Abra o WhatsApp Web (web.whatsapp.com) em uma aba deste Chrome.",
  carregando: "Conectando ao WhatsApp...",
  falha_wajs:
    "Não consegui conectar ao WhatsApp. Provavelmente o WhatsApp atualizou e a biblioteca precisa ser atualizada.",
  nao_autenticado: "Faça login no WhatsApp Web (leia o QR code) e aguarde.",
  conectado: "Conectado ao WhatsApp.",
};

function conexao(situacao: SituacaoConexao, numero: string | null = null, tecnico?: string): Conexao {
  return tecnico ? { situacao, texto: TEXTOS[situacao], numero, tecnico } : { situacao, texto: TEXTOS[situacao], numero };
}

/** Traduz a resposta do service worker em situação de conexão. Função pura. */
export function interpretarEstado(
  resposta: Pick<RespostaObterEstado, "estado" | "recebido_em"> & Partial<RespostaObterEstado>,
  agora: number,
): Conexao {
  const { estado, recebido_em } = resposta;
  if (estado === null || recebido_em === null) return conexao("desconectado");
  if (agora - Date.parse(recebido_em) > VALIDADE_ESTADO_MS) return conexao("desconectado");
  if (estado.erro !== null && !estado.wpp_pronto) return conexao("falha_wajs", null, estado.erro);
  if (!estado.wpp_pronto) return conexao("carregando");
  if (!estado.autenticado) return conexao("nao_autenticado");
  return conexao("conectado", estado.numero_proprio);
}

function mesma(a: Conexao, b: Conexao): boolean {
  return a.situacao === b.situacao && a.numero === b.numero && a.tecnico === b.tecnico;
}

export interface EstadoPainel {
  conexao: Conexao;
  /** Status do service worker, ou null antes da primeira resposta. */
  status: StatusPiolho | null;
  /** Troca o status na hora (depois de salvar a configuração ou pedir um heartbeat). */
  definirStatus(status: StatusPiolho): void;
}

export function useEstado(): EstadoPainel {
  const [atual, setAtual] = useState<Conexao>(conexao("carregando"));
  const [status, setStatus] = useState<StatusPiolho | null>(null);

  useEffect(() => {
    let ativo = true;
    let emVoo = false;

    const consultar = async () => {
      if (emVoo) return;
      emVoo = true;
      let nova: Conexao;
      let novoStatus: StatusPiolho | null = null;
      try {
        const resposta = await obterEstado();
        nova = interpretarEstado(resposta, Date.now());
        novoStatus = resposta.status;
      } catch (erro) {
        nova = conexao("desconectado", null, erro instanceof Error ? erro.message : String(erro));
      } finally {
        emVoo = false;
      }
      if (!ativo) return;
      setAtual((anterior) => (mesma(anterior, nova) ? anterior : nova));
      if (novoStatus) {
        const s = novoStatus;
        setStatus((anterior) => (anterior && JSON.stringify(anterior) === JSON.stringify(s) ? anterior : s));
      }
    };

    void consultar();
    const id = setInterval(() => void consultar(), INTERVALO_MS);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, []);

  const definirStatus = useCallback((s: StatusPiolho) => setStatus(s), []);
  return { conexao: atual, status, definirStatus };
}
