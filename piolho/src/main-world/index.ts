// Entrada do MAIN world. Carrega depois do wa-js vendorizado (ordem definida no manifest).
// Não fala com o wa-js diretamente: todo acesso fica em adapter.ts.
//
// Etapa 1: espera o WPP ficar pronto, lê o próprio número e publica o `estado` pela ponte.
// Etapa 4: escuta mensagens novas (recebidas e enviadas) e publica cada uma como `mensagem_nova`,
// com o número da conta logada. AINDA NÃO faz varredura (TODO Etapa 7).
import { aguardarPronto, aoReceberMensagem, estaPronto, lerEstado, meuNumero } from "./adapter";
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
let escutando = false;
let avisouFalhaEscuta = false;
let ultimaPublicacao = 0;
let erroWajs: string | null = null;

function publicarEstado(): void {
  // O wa-js pode ficar pronto depois dos 30 s de aguardarPronto (login lento): liga a escuta aqui.
  if (!escutando && estaPronto()) iniciarEscuta();
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
  if (pronto) iniciarEscuta();
}

/** Registra a escuta ao vivo uma vez. Sem número conhecido, a mensagem não sai (não há chave). */
function iniciarEscuta(): void {
  if (escutando) return;
  try {
    aoReceberMensagem((item) => {
      const numero = meuNumero();
      if (numero === null) {
        console.warn("[PIOLHO] mensagem nova sem número próprio detectado; não publicada.");
        return;
      }
      publicar("mensagem_nova", { item, numero_monitorado: numero });
    });
    escutando = true;
    console.debug("[PIOLHO] escuta de mensagens novas ativa");
  } catch (erro) {
    // Tenta de novo na próxima checagem (2 s), avisando no console só uma vez.
    if (!avisouFalhaEscuta) console.warn("[PIOLHO] não consegui escutar mensagens novas", erro);
    avisouFalhaEscuta = true;
  }
}

void iniciar();
