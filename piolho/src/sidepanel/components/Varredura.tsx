// Seção "Varredura": progresso da varredura desde o checkpoint (Etapa 7) e os botões
// "Forçar varredura" (relê os últimos 30 dias, ignorando o checkpoint) e "Cancelar".
import { useCallback, useState } from "react";
import type { StatusPiolho } from "../../shared/protocol";
import { formatarDataHora, textoProgressoVarredura } from "../formatacao";
import { cancelarVarredura, forcarVarredura } from "../ponte";

export function Varredura({
  status,
  definirStatus,
}: {
  status: StatusPiolho | null;
  definirStatus: (s: StatusPiolho) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const executar = useCallback(
    async (acao: typeof forcarVarredura) => {
      setOcupado(true);
      setAviso(null);
      try {
        const r = await acao();
        definirStatus(r.status);
        if (r.motivo) setAviso(r.motivo);
      } catch (erro) {
        setAviso(erro instanceof Error ? erro.message : String(erro));
      } finally {
        setOcupado(false);
      }
    },
    [definirStatus],
  );

  const v = status?.varredura ?? null;
  const andando = v !== null && (v.situacao === "pedida" || v.situacao === "rodando");
  const pct = v && v.chats_total > 0 ? Math.round((v.chats_processados / v.chats_total) * 100) : 0;
  const podeForcar = !!status && status.configurado && status.numero !== null && !andando && !ocupado;

  return (
    <section className="secao" aria-labelledby="titulo-varredura" data-testid="varredura">
      <h2 className="secao__titulo" id="titulo-varredura">
        Varredura
      </h2>
      <p className="secao__apoio">
        Busca as conversas que chegaram com o Chrome fechado, desde o último envio aceito (no máximo 30 dias).
        Roda sozinha ao abrir o WhatsApp e a cada 6 horas.
      </p>
      {v ? (
        <div className="varredura" data-situacao={v.situacao}>
          <p className="varredura__texto" data-testid="varredura-progresso" role="status" aria-live="polite">
            {textoProgressoVarredura(v)}
          </p>
          {andando || v.chats_total > 0 ? (
            <div
              className="barra"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label="Progresso da varredura"
            >
              <span className="barra__preenchida" style={{ width: `${v.situacao === "concluida" ? 100 : pct}%` }} />
            </div>
          ) : null}
          <p className="campo__dica">
            {v.forcada ? "Forçada" : "Automática"}, desde {v.desde ? formatarDataHora(v.desde) : "o checkpoint"}.
            Iniciada em {formatarDataHora(v.iniciada_em)}.
          </p>
          {v.erro ? (
            <p className="retorno retorno--erro" data-testid="varredura-erro">
              {v.erro}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="secao__apoio" data-testid="varredura-progresso">
          Nenhuma varredura ainda.
        </p>
      )}
      {aviso ? <p className="retorno retorno--erro">{aviso}</p> : null}
      <div className="secao__acoes">
        <button
          type="button"
          className="botao botao--contorno"
          onClick={() => void executar(forcarVarredura)}
          disabled={!podeForcar}
          data-testid="botao-forcar-varredura"
        >
          Forçar varredura
        </button>
        {andando ? (
          <button
            type="button"
            className="botao botao--limpar"
            onClick={() => void executar(cancelarVarredura)}
            disabled={ocupado}
            data-testid="botao-cancelar-varredura"
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </section>
  );
}
