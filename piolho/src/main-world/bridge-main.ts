// Ponte do MAIN world: publica mensagens para o content script via window.postMessage e recebe
// pedidos dele pelo mesmo canal.
//
// Segurança (mesmas regras da extensão de referência):
// - Tudo que sai passa antes pelo validador do protocolo; se não passar, não sai.
// - Só aceita mensagens da própria janela (event.source === window), no namespace __PIOLHO__,
//   que passem no validador e não tenham sido montadas pelo próprio MAIN world (as nossas
//   publicações voltam para este mesmo listener e são descartadas pela origem).
import {
  montarMensagem,
  validarMensagem,
  type MensagemPonte,
  type PayloadDe,
  type TipoMensagem,
} from "../shared/protocol";

/** Tipos que o MAIN world pode publicar. */
const TIPOS_PUBLICAVEIS = new Set<TipoMensagem>(["estado", "mensagem_nova", "varredura"]);

/** Valida e publica uma mensagem para o content script. Devolve false se não passou no schema. */
export function publicar<T extends TipoMensagem>(tipo: T, payload: PayloadDe<T>): boolean {
  if (!TIPOS_PUBLICAVEIS.has(tipo)) return false;
  const msg = validarMensagem(montarMensagem(tipo, "main", payload));
  if (msg === null) {
    console.warn(`[PIOLHO] mensagem "${tipo}" fora do schema; não publicada.`);
    return false;
  }
  window.postMessage(msg, window.location.origin);
  return true;
}

/**
 * Filtra o que chega ao MAIN world. Devolve a mensagem validada (só com campos do schema) ou null.
 * Função pura, testada em tests/ponte.test.ts.
 */
export function filtrarRecebida(fonte: unknown, janela: unknown, dado: unknown): MensagemPonte | null {
  if (fonte !== janela) return null;
  const msg = validarMensagem(dado);
  if (msg === null || msg.origem !== "content") return null;
  return msg;
}

function tratar(msg: MensagemPonte): void {
  switch (msg.tipo) {
    case "varredura":
      // TODO Etapa 7: com fase "pedido", rodar a varredura desde msg.payload.desde e publicar o
      // progresso (tipo "varredura", fase "progresso") e cada item (tipo "mensagem_nova").
      return;
    default:
      return;
  }
}

let iniciada = false;

export function iniciarPonteMain(): void {
  if (iniciada) return;
  iniciada = true;
  window.addEventListener("message", (event: MessageEvent) => {
    const msg = filtrarRecebida(event.source, window, event.data);
    if (msg !== null) tratar(msg);
  });
}
