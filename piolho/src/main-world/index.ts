// Entrada do MAIN world. Carrega depois do wa-js vendorizado (ordem definida no manifest).
// Não fala com o wa-js diretamente: todo acesso fica em adapter.ts.
//
// Etapa 1: espera o WPP ficar pronto, lê o próprio número e publica o `estado` pela ponte.
// Etapa 4: escuta mensagens novas (recebidas e enviadas) e publica cada uma como `mensagem_nova`,
// com o número da conta logada.
// Etapa 5: modo descoberta (log no console, sem conteúdo), ligado pelo content script.
// Etapa 6: guarda os padrões de texto (mensagem `padroes`) para a regra do texto_abertura.
// Etapa 7: varredura desde o checkpoint (mensagem `varredura`, fase `pedido` ou `cancelar`), uma
// por vez, publicando o progresso.
import type { MensagemPonte } from "../shared/protocol";
import {
  aguardarPronto,
  aoReceberMensagem,
  carregarMensagensDesde,
  criarMontadorDeItens,
  estaPronto,
  lerEstado,
  listarChatsIndividuais,
  meuNumero,
} from "./adapter";
import { iniciarPonteMain, publicar } from "./bridge-main";
import { logarDescoberta, PREFIXO_DESCOBERTA } from "./descoberta";
import { varrer } from "./varredura";

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
/** Pede os padrões de novo de tempos em tempos (o service worker também empurra a cada heartbeat). */
const PEDIR_PADROES_MS = 5 * 60_000;

let ultimoJson = "";
let escutando = false;
let avisouFalhaEscuta = false;
let ultimaPublicacao = 0;
let erroWajs: string | null = null;

/** Padrões de texto do último heartbeat (regra b do texto_abertura). */
let padroes: readonly string[] = [];
/** Modo descoberta ligado (chrome.storage.local.piolho_descoberta, via content script). */
let descoberta = false;
/** Varredura em andamento: só uma por aba. */
let varredura: { cancelar: boolean } | null = null;

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

function pedirPadroes(): void {
  publicar("obter_padroes", null);
}

async function iniciar(): Promise<void> {
  iniciarPonteMain(tratar);
  console.debug("[PIOLHO] main world carregado");
  publicarEstado();
  setInterval(publicarEstado, INTERVALO_CHECAGEM_MS);
  pedirPadroes();
  setInterval(pedirPadroes, PEDIR_PADROES_MS);

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
    aoReceberMensagem(
      (item) => {
        const numero = meuNumero();
        if (numero === null) {
          console.warn("[PIOLHO] mensagem nova sem número próprio detectado; não publicada.");
          return;
        }
        publicar("mensagem_nova", { item, numero_monitorado: numero });
      },
      { padroes: () => padroes, descoberta: () => descoberta, aoDescobrir: logarDescoberta },
    );
    escutando = true;
    console.debug("[PIOLHO] escuta de mensagens novas ativa");
  } catch (erro) {
    // Tenta de novo na próxima checagem (2 s), avisando no console só uma vez.
    if (!avisouFalhaEscuta) console.warn("[PIOLHO] não consegui escutar mensagens novas", erro);
    avisouFalhaEscuta = true;
  }
}

/** O que chega do content script (já validado em bridge-main.ts). */
function tratar(msg: MensagemPonte): void {
  switch (msg.tipo) {
    case "padroes":
      padroes = msg.payload.padroes_texto;
      return;
    case "descoberta":
      if (msg.payload.ativo !== descoberta) {
        console.log(PREFIXO_DESCOBERTA, msg.payload.ativo ? "modo descoberta LIGADO" : "modo descoberta desligado");
      }
      descoberta = msg.payload.ativo;
      return;
    case "varredura":
      if (msg.payload.fase === "pedido") void iniciarVarredura(msg.payload.desde);
      else if (msg.payload.fase === "cancelar" && varredura) varredura.cancelar = true;
      return;
    default:
      return;
  }
}

async function iniciarVarredura(desde: string | null): Promise<void> {
  if (varredura) {
    console.debug("[PIOLHO] varredura já em andamento; pedido ignorado");
    return;
  }
  const numero = meuNumero();
  if (!estaPronto() || numero === null) {
    publicar("varredura", {
      fase: "progresso",
      desde,
      chats_total: 0,
      chats_processados: 0,
      itens_enfileirados: 0,
      chat_atual: null,
      concluida: false,
      cancelada: false,
      erro: "WhatsApp ainda não está pronto ou o número não foi detectado.",
    });
    return;
  }
  const controle = { cancelar: false };
  varredura = controle;
  try {
    const montar = criarMontadorDeItens();
    const fim = await varrer(
      {
        listarChatsIndividuais,
        carregarMensagensDesde,
        montarItem: montar,
        meuNumero,
        padroes: () => padroes,
        pausa: (ms) => new Promise((r) => setTimeout(r, ms)),
        agora: () => Date.now(),
      },
      {
        desde,
        // O número é o do início da varredura: os itens vão para a fila dele.
        aoItem: (item) => publicar("mensagem_nova", { item, numero_monitorado: numero }),
        aoProgresso: (p) => publicar("varredura", p),
        cancelada: () => controle.cancelar,
      },
    );
    console.debug("[PIOLHO] varredura terminada", fim);
  } finally {
    varredura = null;
  }
}

void iniciar();
