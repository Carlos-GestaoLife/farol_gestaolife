// Side panel do piolho (Etapa 8): conexão com o WhatsApp e número detectado (banner), envio ao
// sistema (computador, heartbeat, sincronização, padrões, fila, rejeitados, último envio, próxima
// tentativa e erro), varredura (progresso, forçar e cancelar), diagnóstico (modo descoberta) e
// configuração (URL, token e nome do computador).
import { BannerStatus } from "./components/BannerStatus";
import { Configuracao } from "./components/Configuracao";
import { Descoberta } from "./components/Descoberta";
import { Envio } from "./components/Envio";
import { Rodape } from "./components/Rodape";
import { Varredura } from "./components/Varredura";
import { useArmazenamentoLocal } from "./state/useArmazenamentoLocal";
import { useEstado } from "./state/useEstado";

export function App() {
  const { conexao, status, definirStatus } = useEstado();
  const local = useArmazenamentoLocal();
  return (
    <div className="app">
      <header className="cabecalho">
        <h1 className="cabecalho__titulo">Piolho</h1>
        <p className="cabecalho__sub">Metadados do WhatsApp para o Sistema de Leads</p>
      </header>
      <BannerStatus conexao={conexao} />
      <main className="conteudo">
        <Envio status={status} definirStatus={definirStatus} nomeComputador={local.nomeComputador} />
        <Varredura status={status} definirStatus={definirStatus} />
        <Descoberta ativo={local.descoberta} carregado={local.carregado} />
        <Configuracao aoSalvar={definirStatus} />
      </main>
      <Rodape />
    </div>
  );
}
