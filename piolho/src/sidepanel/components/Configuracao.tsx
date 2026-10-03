// Seção "Configuração": URL do sistema, token do dispositivo e nome deste computador (opcional,
// só informativo e local), salvos em chrome.storage.local.
// O token nunca volta para a tela depois de salvo: o painel só mostra se está configurado.
// Depois de salvar, avisa o service worker (mensagem `config`, sem o token): ele relê a
// configuração do chrome.storage.local e manda um heartbeat na hora.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LIMITES, type StatusPiolho } from "../../shared/protocol";
import { avisarConfig } from "../ponte";
import { URL_SISTEMA_PADRAO, normalizarUrlSistema, padraoDeHost } from "../../shared/config";
import {
  lerNomeComputador,
  lerUrlSistema,
  removerToken,
  salvarNomeComputador,
  salvarToken,
  salvarUrlSistema,
  tokenConfigurado,
} from "../../shared/armazenamento";

type Retorno = { tom: "ok" | "erro"; texto: string } | null;

export function Configuracao({ aoSalvar }: { aoSalvar?: (status: StatusPiolho) => void }) {
  const [urlSalva, setUrlSalva] = useState<string | null>(null);
  const [urlDigitada, setUrlDigitada] = useState("");
  const [tokenOk, setTokenOk] = useState(false);
  const [tokenDigitado, setTokenDigitado] = useState("");
  const [nomeDigitado, setNomeDigitado] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [retorno, setRetorno] = useState<Retorno>(null);

  useEffect(() => {
    let ativo = true;
    void Promise.all([lerUrlSistema(), tokenConfigurado(), lerNomeComputador()]).then(([url, temToken, nome]) => {
      if (!ativo) return;
      setUrlSalva(url);
      setUrlDigitada(url);
      setTokenOk(temToken);
      setNomeDigitado(nome ?? "");
    });
    return () => {
      ativo = false;
    };
  }, []);

  const salvar = useCallback(
    async (evento: FormEvent<HTMLFormElement>) => {
      evento.preventDefault();
      setRetorno(null);
      const url = normalizarUrlSistema(urlDigitada);
      if (url === null) {
        setRetorno({
          tom: "erro",
          texto: "URL inválida. Use https:// (ou http://localhost para desenvolvimento).",
        });
        return;
      }
      setSalvando(true);
      try {
        // URL diferente da padrão: pedir permissão de host em tempo de execução
        // (optional_host_permissions). Precisa ser a primeira chamada assíncrona do clique, para
        // o Chrome reconhecer o gesto do usuário.
        if (url !== URL_SISTEMA_PADRAO) {
          const padrao = padraoDeHost(url);
          const concedida = padrao !== null && (await chrome.permissions.request({ origins: [padrao] }));
          if (!concedida) {
            setRetorno({
              tom: "erro",
              texto: "Sem a permissão de acesso a esse endereço, a extensão não consegue falar com o sistema.",
            });
            return;
          }
        }
        await salvarUrlSistema(url);
        await salvarNomeComputador(nomeDigitado);
        setUrlSalva(url);
        setUrlDigitada(url);
        const tokenNovo = tokenDigitado.trim();
        if (tokenNovo) {
          await salvarToken(tokenNovo);
          setTokenDigitado("");
          setTokenOk(true);
        }
        setRetorno({ tom: "ok", texto: "Configuração salva." });
        try {
          const status = await avisarConfig(url);
          aoSalvar?.(status);
        } catch (erro) {
          // Salvo mesmo assim: o service worker também percebe a mudança pelo storage.
          console.warn("[PIOLHO] não consegui avisar o service worker", erro);
        }
      } catch (erro) {
        const detalhe = erro instanceof Error ? erro.message : String(erro);
        setRetorno({ tom: "erro", texto: `Não consegui salvar: ${detalhe}` });
      } finally {
        setSalvando(false);
      }
    },
    [urlDigitada, tokenDigitado, nomeDigitado, aoSalvar],
  );

  const remover = useCallback(async () => {
    if (!window.confirm("Remover o token deste computador? A extensão para de enviar até receber outro.")) return;
    setRetorno(null);
    try {
      await removerToken();
      setTokenOk(false);
      setRetorno({ tom: "ok", texto: "Token removido." });
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : String(erro);
      setRetorno({ tom: "erro", texto: `Não consegui remover o token: ${detalhe}` });
    }
  }, []);

  const carregando = urlSalva === null;

  return (
    <section className="secao" aria-labelledby="titulo-configuracao" data-testid="configuracao">
      <h2 className="secao__titulo" id="titulo-configuracao">
        Configuração
      </h2>
      <p className="secao__apoio">
        Feita uma vez por computador. O número do WhatsApp é detectado sozinho.
      </p>
      <form className="formulario" onSubmit={(e) => void salvar(e)}>
        <label className="campo">
          <span className="campo__rotulo">URL do sistema</span>
          <input
            className="campo__entrada"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={urlDigitada}
            onChange={(e) => setUrlDigitada(e.target.value)}
            placeholder={URL_SISTEMA_PADRAO}
            disabled={carregando}
            data-testid="campo-url"
          />
          {(normalizarUrlSistema(urlDigitada) ?? urlDigitada.trim()) !== URL_SISTEMA_PADRAO ? (
            <span className="campo__linha">
              <span className="campo__dica">Endereço diferente do padrão: o Chrome vai pedir permissão.</span>
              <button
                type="button"
                className="botao botao--secundario"
                onClick={() => setUrlDigitada(URL_SISTEMA_PADRAO)}
              >
                Usar o padrão
              </button>
            </span>
          ) : null}
        </label>
        <label className="campo">
          <span className="campo__linha">
            <span className="campo__rotulo">Token do dispositivo</span>
            <span className={`selo ${tokenOk ? "selo--ok" : "selo--neutro"}`} data-testid="selo-token">
              {tokenOk ? "Configurado" : "Não configurado"}
            </span>
          </span>
          <input
            className="campo__entrada"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={tokenDigitado}
            onChange={(e) => setTokenDigitado(e.target.value)}
            placeholder={tokenOk ? "Cole um token novo só para trocar" : "Cole o token aqui"}
            disabled={carregando}
            data-testid="campo-token"
          />
          <span className="campo__dica">O token é gerado na tela Dispositivos do Sistema de Leads.</span>
        </label>
        <label className="campo">
          <span className="campo__rotulo">Nome deste computador (opcional)</span>
          <input
            className="campo__entrada"
            type="text"
            autoComplete="off"
            maxLength={LIMITES.nomeComputador}
            value={nomeDigitado}
            onChange={(e) => setNomeDigitado(e.target.value)}
            placeholder="Ex.: PC do comercial 2"
            disabled={carregando}
            data-testid="campo-nome"
          />
          <span className="campo__dica">Só aparece neste painel; não vai para o sistema.</span>
        </label>
        {retorno ? (
          <p className={`retorno retorno--${retorno.tom}`} role={retorno.tom === "erro" ? "alert" : "status"}>
            {retorno.texto}
          </p>
        ) : null}
        <div className="secao__acoes">
          <button type="submit" className="botao botao--primario" disabled={carregando || salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
          {tokenOk ? (
            <button type="button" className="botao botao--limpar" onClick={() => void remover()}>
              Remover token
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
