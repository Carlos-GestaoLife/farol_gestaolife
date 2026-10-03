// Entrada do MAIN world. Carrega depois do wa-js vendorizado (ordem definida no manifest).
// Não fala com o wa-js diretamente: todo acesso fica em adapter.ts.
//
// Etapa 1: espera o WPP ficar pronto, lê o próprio número e publica o `estado` pela ponte.
// AINDA NÃO escuta mensagens (TODO Etapa 4) nem faz varredura (TODO Etapa 7).
import { aguardarPronto, estaPronto, lerEstado } from "./adapter";
import { iniciarPonteMain, publicar } from "./bridge-main";

/** Mensagem quando o wa-js não fica pronto: provavelmente o WhatsApp atualizou. */
const FALHA_WAJS =
  "O wa-js não ficou pronto em 30 s. Provavelmente o WhatsApp atualizou e a biblioteca precisa ser atualizada.";

/** De quanto em quanto tempo o estado é conferido (publica só se mudou). */
const INTERVALO_CHECAGEM_MS = 2_000;
/**
 * Republica o estado mesmo sem mudança: o service worker do MV3 dorme e perde a memória, e a
 * primeira publicação pode sair antes do content script estar ouvindo.
 */
const REPUBLICAR_MS = 15_000;

let ultimoJson = "";
let ultimaPublicacao = 0;
let erroWajs: string | null = null;

function publicarEstado(): void {
  const estado = lerEstado(estaPronto() ? null : erroWajs);
  const json = JSON.stringify(estado);
  const agora = Date.now();
  if (json === ultimoJson && agora - ultimaPublicacao < REPUBLICAR_MS) return;
  if (publicar("estado", estado)) {
    ultimoJson = json;
    ultimaPublicacao = agora;
  }
}

async function iniciar(): Promise<void> {
  iniciarPonteMain();
  console.debug("[PIOLHO] main world carregado");
  publicarEstado();
  setInterval(publicarEstado, INTERVALO_CHECAGEM_MS);

  const pronto = await aguardarPronto(30_000);
  if (pronto) {
    console.debug("[PIOLHO] wa-js pronto");
  } else {
    erroWajs = FALHA_WAJS;
    console.warn(`[PIOLHO] ${FALHA_WAJS}`);
  }
  publicarEstado();
  // TODO Etapa 4: adapter.aoReceberMensagem(item => publicar("mensagem_nova", { item })).
}

void iniciar();
