// Valores locais do painel em chrome.storage.local: nome do computador e modo descoberta.
// Relidos quando mudam (outra janela do painel, ou o próprio painel salvando).
import { useEffect, useState } from "react";
import { CHAVES_STORAGE } from "../../shared/config";
import { lerModoDescoberta, lerNomeComputador } from "../../shared/armazenamento";

export function useArmazenamentoLocal(): { nomeComputador: string | null; descoberta: boolean; carregado: boolean } {
  const [nomeComputador, setNome] = useState<string | null>(null);
  const [descoberta, setDescoberta] = useState(false);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    let ativo = true;
    const ler = () =>
      void Promise.all([lerNomeComputador(), lerModoDescoberta()]).then(([nome, desc]) => {
        if (!ativo) return;
        setNome(nome);
        setDescoberta(desc);
        setCarregado(true);
      });
    ler();
    const ouvinte = (mudancas: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      if (CHAVES_STORAGE.nomeComputador in mudancas || CHAVES_STORAGE.descoberta in mudancas) ler();
    };
    chrome.storage.onChanged.addListener(ouvinte);
    return () => {
      ativo = false;
      chrome.storage.onChanged.removeListener(ouvinte);
    };
  }, []);

  return { nomeComputador, descoberta, carregado };
}
