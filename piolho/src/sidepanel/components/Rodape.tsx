/** Rodapé com a versão (lida do manifest, que vem do package.json). */
export function Rodape() {
  let versao = "";
  try {
    versao = chrome.runtime.getManifest().version;
  } catch {
    versao = "";
  }
  return (
    <footer className="rodape" data-testid="rodape">
      <p className="rodape__versao">Piolho {versao ? `v${versao}` : ""}</p>
    </footer>
  );
}
