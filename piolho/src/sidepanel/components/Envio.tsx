// Seção "Envio ao sistema": computador, heartbeat, sincronização, padrões, fila, rejeitados (com a
// lista dos últimos 20), último envio, próxima tentativa e erro atual.
import { useCallback, useEffect, useState } from "react";
import type { StatusPiolho } from "../../shared/protocol";
import { abreviarId, formatarDataHora, formatarHora, nomeErro, tempoRelativo } from "../formatacao";
import { heartbeatAgora } from "../ponte";

function Linha({ rotulo, valor, testid }: { rotulo: string; valor: string; testid: string }) {
  return (
    <div className="dado">
      <dt className="dado__rotulo">{rotulo}</dt>
      <dd className="dado__valor" data-testid={testid}>
        {valor}
      </dd>
    </div>
  );
}

/** Relógio de 1 s para os textos "há X". */
function useAgora(): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return agora;
}

export function Envio({
  status,
  definirStatus,
  nomeComputador,
}: {
  status: StatusPiolho | null;
  definirStatus: (s: StatusPiolho) => void;
  nomeComputador: string | null;
}) {
  const agora = useAgora();
  const [enviando, setEnviando] = useState(false);
  const [falhaPedido, setFalhaPedido] = useState<string | null>(null);

  const pedirHeartbeat = useCallback(async () => {
    setEnviando(true);
    setFalhaPedido(null);
    try {
      definirStatus(await heartbeatAgora());
    } catch (erro) {
      setFalhaPedido(erro instanceof Error ? erro.message : String(erro));
    } finally {
      setEnviando(false);
    }
  }, [definirStatus]);

  if (status === null) {
    return (
      <section className="secao" aria-labelledby="titulo-envio" data-testid="envio">
        <h2 className="secao__titulo" id="titulo-envio">
          Envio ao sistema
        </h2>
        <p className="secao__apoio">Carregando...</p>
      </section>
    );
  }

  const erro = status.ultimo_erro;
  const emBackoff = status.proximo_envio_em !== null && Date.parse(status.proximo_envio_em) > agora;

  return (
    <section className="secao" aria-labelledby="titulo-envio" data-testid="envio">
      <h2 className="secao__titulo" id="titulo-envio">
        Envio ao sistema
      </h2>
      {!status.configurado ? (
        <p className="secao__apoio">Configure o token do dispositivo abaixo para começar a enviar.</p>
      ) : status.numero === null ? (
        <p className="secao__apoio">Abra o WhatsApp Web e aguarde a conexão para enviar.</p>
      ) : null}

      {status.token_invalido ? (
        <div className="aviso-erro" role="alert" data-testid="token-invalido">
          <strong>Token inválido.</strong> O sistema recusou o token deste computador e o envio está
          parado. Gere um token novo na tela Dispositivos do Sistema de Leads e salve abaixo.
        </div>
      ) : null}

      <dl className="dados">
        <Linha
          rotulo="Este computador"
          testid="nome-computador"
          valor={nomeComputador ?? "sem nome (opcional, abaixo)"}
        />
        <Linha
          rotulo="Último heartbeat"
          testid="ultimo-heartbeat"
          valor={status.ultimo_heartbeat_em ? tempoRelativo(status.ultimo_heartbeat_em, agora) : "nunca"}
        />
        <Linha
          rotulo="Servidor"
          testid="sync-servidor"
          valor={
            status.ultimo_sync_servidor
              ? `sincronizado até ${formatarDataHora(status.ultimo_sync_servidor)}`
              : "nunca"
          }
        />
        <Linha rotulo="Padrões de texto" testid="padroes-texto" valor={String(status.qtd_padroes_texto)} />
        <Linha rotulo="Fila pendente" testid="fila-pendente" valor={String(status.pendentes)} />
        <Linha rotulo="Rejeitados" testid="rejeitados" valor={String(status.rejeitados)} />
        <Linha
          rotulo="Último envio"
          testid="ultimo-envio"
          valor={
            status.ultimo_envio
              ? `${tempoRelativo(status.ultimo_envio.quando, agora)}, ${status.ultimo_envio.aceitos} ${
                  status.ultimo_envio.aceitos === 1 ? "aceito" : "aceitos"
                }${status.ultimo_envio.rejeitados ? `, ${status.ultimo_envio.rejeitados} rejeitados` : ""}`
              : "nenhum"
          }
        />
        {emBackoff && status.proximo_envio_em ? (
          <Linha
            rotulo="Próxima tentativa"
            testid="proximo-envio"
            valor={`às ${formatarHora(status.proximo_envio_em)} (${tempoRelativo(status.proximo_envio_em, agora)})`}
          />
        ) : null}
      </dl>

      {status.padroes_texto.length > 0 ? (
        <details className="expansivel" data-testid="lista-padroes">
          <summary>Padrões recebidos ({status.padroes_texto.length})</summary>
          <ul>
            {status.padroes_texto.map((p, i) => (
              <li key={`${i}-${p}`}>{p}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {status.ultimos_rejeitados.length > 0 ? (
        <details className="expansivel" data-testid="lista-rejeitados">
          <summary>
            Últimos rejeitados ({status.ultimos_rejeitados.length} de {status.rejeitados})
          </summary>
          <ul>
            {status.ultimos_rejeitados.map((r, i) => (
              <li key={`${i}-${r.wa_msg_id}`}>
                <code title={r.wa_msg_id}>{abreviarId(r.wa_msg_id)}</code>: {r.motivo}{" "}
                <span className="campo__dica">({tempoRelativo(r.rejeitado_em, agora)})</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {erro ? (
        <p className="retorno retorno--erro" role="alert" data-testid="ultimo-erro" data-tipo={erro.tipo}>
          Erro ({nomeErro(erro.tipo)}, {tempoRelativo(erro.quando, agora)}): {erro.mensagem}
        </p>
      ) : null}
      {falhaPedido ? <p className="retorno retorno--erro">Não consegui pedir o heartbeat: {falhaPedido}</p> : null}

      <div className="secao__acoes">
        <button
          type="button"
          className="botao botao--contorno"
          onClick={() => void pedirHeartbeat()}
          disabled={enviando || !status.configurado || status.numero === null}
          data-testid="botao-heartbeat"
        >
          {enviando ? "Enviando..." : "Enviar heartbeat agora"}
        </button>
      </div>
    </section>
  );
}
