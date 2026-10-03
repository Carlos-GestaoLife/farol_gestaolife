import { formatarTelefone } from "../formatacao";
import type { Conexao, SituacaoConexao } from "../state/useEstado";
import { Alerta, Spinner } from "./Icones";

type Tom = "ok" | "aviso" | "erro";

const TOM: Record<SituacaoConexao, Tom> = {
  conectado: "ok",
  carregando: "aviso",
  nao_autenticado: "aviso",
  falha_wajs: "erro",
  desconectado: "erro",
};

function IconeTom({ tom }: { tom: Tom }) {
  switch (tom) {
    case "ok":
      return <span className="banner__ponto" />;
    case "aviso":
      return <Spinner tamanho={12} tom="aviso" />;
    case "erro":
      return <Alerta tamanho={14} />;
  }
}

export function BannerStatus({ conexao }: { conexao: Conexao }) {
  const tom = TOM[conexao.situacao];
  const erro = tom === "erro";
  const conectado = conexao.situacao === "conectado";
  return (
    <div
      className={`banner banner--${tom}`}
      data-testid="banner-status"
      data-situacao={conexao.situacao}
      role={erro ? "alert" : "status"}
      aria-live={erro ? "assertive" : "polite"}
    >
      <span className="banner__icone" aria-hidden="true">
        <IconeTom tom={tom} />
      </span>
      <div className="banner__corpo">
        <span className="banner__texto">{conexao.texto}</span>
        {conectado ? (
          <span className="banner__texto" data-testid="numero-detectado">
            {conexao.numero
              ? `Número detectado: ${formatarTelefone(conexao.numero)}`
              : "Número ainda não detectado."}
          </span>
        ) : null}
        {conexao.tecnico ? <span className="banner__tecnico">Detalhe: {conexao.tecnico}</span> : null}
      </div>
    </div>
  );
}
