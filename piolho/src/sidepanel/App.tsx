// Side panel do piolho. Etapa 1: status da conexão com o WhatsApp e configuração.
// TODO Etapa 8: nome do dispositivo, fila pendente, último envio, último erro e "Forçar varredura".
import { BannerStatus } from "./components/BannerStatus";
import { Configuracao } from "./components/Configuracao";
import { Rodape } from "./components/Rodape";
import { useEstado } from "./state/useEstado";

export function App() {
  const conexao = useEstado();
  return (
    <div className="app">
      <header className="cabecalho">
        <h1 className="cabecalho__titulo">Piolho</h1>
        <p className="cabecalho__sub">Metadados do WhatsApp para o Sistema de Leads</p>
      </header>
      <BannerStatus conexao={conexao} />
      <main className="conteudo">
        <Configuracao />
      </main>
      <Rodape />
    </div>
  );
}
