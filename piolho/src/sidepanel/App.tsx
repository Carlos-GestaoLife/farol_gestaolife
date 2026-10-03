// Side panel do piolho: conexão com o WhatsApp, envio ao sistema (heartbeat, fila, rejeitados,
// último envio e erro) e configuração.
// TODO Etapa 8: nome do dispositivo e "Forçar varredura".
import { BannerStatus } from "./components/BannerStatus";
import { Configuracao } from "./components/Configuracao";
import { Envio } from "./components/Envio";
import { Rodape } from "./components/Rodape";
import { useEstado } from "./state/useEstado";

export function App() {
  const { conexao, status, definirStatus } = useEstado();
  return (
    <div className="app">
      <header className="cabecalho">
        <h1 className="cabecalho__titulo">Piolho</h1>
        <p className="cabecalho__sub">Metadados do WhatsApp para o Sistema de Leads</p>
      </header>
      <BannerStatus conexao={conexao} />
      <main className="conteudo">
        <Envio status={status} definirStatus={definirStatus} />
        <Configuracao aoSalvar={definirStatus} />
      </main>
      <Rodape />
    </div>
  );
}
