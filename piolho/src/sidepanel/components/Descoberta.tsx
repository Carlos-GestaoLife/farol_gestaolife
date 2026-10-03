// Seção "Diagnóstico": liga ou desliga o modo descoberta (Etapa 5, roteiro em docs/CTWA.md).
// Ligado, cada mensagem nova é logada no console da aba do WhatsApp (DevTools), sem o texto e sem
// mídia. Nada disso vai para o sistema. Só para diagnóstico: desligue depois.
import { useState } from "react";
import { salvarModoDescoberta } from "../../shared/armazenamento";

export function Descoberta({ ativo, carregado }: { ativo: boolean; carregado: boolean }) {
  const [falha, setFalha] = useState<string | null>(null);

  const alternar = async () => {
    setFalha(null);
    try {
      await salvarModoDescoberta(!ativo);
    } catch (erro) {
      setFalha(erro instanceof Error ? erro.message : String(erro));
    }
  };

  return (
    <section className="secao" aria-labelledby="titulo-descoberta" data-testid="descoberta">
      <h2 className="secao__titulo" id="titulo-descoberta">
        Diagnóstico
      </h2>
      <p className="secao__apoio">
        O modo descoberta mostra no console da aba do WhatsApp (DevTools) os dados técnicos de cada mensagem
        nova, sem o texto e sem mídia, para conferir de onde vem o anúncio. É só para diagnóstico: desligue
        quando terminar.
      </p>
      {ativo ? (
        <p className="aviso-alerta" role="status" data-testid="descoberta-ativa">
          Modo descoberta ligado. Veja o console da aba do WhatsApp (prefixo "[piolho descoberta]").
        </p>
      ) : null}
      {falha ? <p className="retorno retorno--erro">{falha}</p> : null}
      <div className="secao__acoes">
        <button
          type="button"
          className={`botao ${ativo ? "botao--limpar" : "botao--contorno"}`}
          onClick={() => void alternar()}
          disabled={!carregado}
          aria-pressed={ativo}
          data-testid="botao-descoberta"
        >
          {ativo ? "Desligar modo descoberta" : "Modo descoberta"}
        </button>
      </div>
    </section>
  );
}
