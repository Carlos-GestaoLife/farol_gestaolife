// Classificação de IDs do WhatsApp e telefone na forma canônica do Sistema de Leads.
//
// Copiado da extensão de referência (github.com/Carlos-GestaoLife/extrator_contatos,
// src/shared/phone.ts) e adaptado à forma canônica do sistema (sistema-leads/src/nucleo/
// normalizacao.ts): só dígitos com DDI e, para celular brasileiro, com o nono dígito
// (13 dígitos). O servidor normaliza de novo; aqui mandamos o melhor que der.
//
// Regra central: um LID ("...@lid") NUNCA é telefone. Os dígitos de um LID são um identificador
// opaco e não podem ir para o campo telefone, mesmo que tenham comprimento plausível.

export type TipoId = "c.us" | "lid" | "g.us" | "broadcast" | "newsletter" | "desconhecido";

const DDI_BRASIL = "55";
const RE_TELEFONE = /^\d{10,15}$/;

/**
 * Classifica pelo sufixo: "@c.us", "@lid", "@g.us", "@broadcast" (status@broadcast e listas de
 * transmissão), "@newsletter" (canais); o resto é "desconhecido".
 */
export function classificarId(id: string): TipoId {
  if (id.endsWith("@c.us")) return "c.us";
  if (id.endsWith("@lid")) return "lid";
  if (id.endsWith("@g.us")) return "g.us";
  if (id.endsWith("@broadcast")) return "broadcast";
  if (id.endsWith("@newsletter")) return "newsletter";
  return "desconhecido";
}

/** Conversa individual (a única que o piolho lê): "@c.us" ou "@lid". */
export function ehChatIndividual(id: string): boolean {
  const tipo = classificarId(id);
  return tipo === "c.us" || tipo === "lid";
}

/** Parte do usuário de um id: antes do "@" e sem o sufixo de dispositivo (":12"). */
function usuarioDoId(id: string): string {
  const arroba = id.indexOf("@");
  const semServidor = arroba === -1 ? id : id.slice(0, arroba);
  const doisPontos = semServidor.indexOf(":");
  return doisPontos === -1 ? semServidor : semServidor.slice(0, doisPontos);
}

/**
 * Aplica a regra do nono dígito a dígitos que já têm DDI. Número brasileiro com 12 dígitos
 * (55 + DDD + 8) cujo número local começa com 6, 7, 8 ou 9 (celular antigo, como vem em IDs
 * antigos do WhatsApp) ganha o 9 e fica com 13. Fixo (local de 2 a 5) e estrangeiro ficam como estão.
 */
export function aplicarNonoDigito(digitos: string): string {
  if (digitos.length === 12 && digitos.startsWith(DDI_BRASIL)) {
    const ddd = digitos.slice(2, 4);
    const local = digitos.slice(4);
    if (/^[1-9][1-9]$/.test(ddd) && "6789".includes(local[0])) {
      return DDI_BRASIL + ddd + "9" + local;
    }
  }
  return digitos;
}

/**
 * Só para id "@c.us": dígitos antes do "@" (10 a 15), com o nono dígito aplicado; senão null.
 * Para "@lid", "@g.us" e outros devolve SEMPRE null. Ignora o sufixo de dispositivo (":12").
 * IDs do WhatsApp sempre trazem o DDI, então aqui nunca se assume Brasil.
 */
export function extrairDigitos(id: string): string | null {
  if (classificarId(id) !== "c.us") return null;
  const usuario = usuarioDoId(id);
  return RE_TELEFONE.test(usuario) ? aplicarNonoDigito(usuario) : null;
}

/**
 * Normaliza um valor livre ("+55 (62) 99999-8888", "5562999998888@c.us") para a forma canônica.
 * - Com "@": só "@c.us" vale (mesma regra de extrairDigitos); "@lid", "@g.us" etc. devolvem null.
 * - Sem "@": tira a formatação e os zeros à esquerda; com 10 ou 11 dígitos e sem "+" ou "00" na
 *   frente, assume Brasil (55), como o servidor.
 * - Valida 10 a 15 dígitos e aplica o nono dígito. Senão null.
 */
export function normalizarTelefone(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = valor.trim();
  if (texto.length === 0) return null;
  if (texto.includes("@")) return extrairDigitos(texto);
  if (/[a-z]/i.test(texto)) return null;

  let digitos = texto.replace(/\D/g, "");
  const temDdiExplicito = texto.startsWith("+") || digitos.startsWith("00");
  digitos = digitos.replace(/^0+/, "");
  if (!temDdiExplicito && (digitos.length === 10 || digitos.length === 11)) {
    digitos = DDI_BRASIL + digitos;
  }
  if (!RE_TELEFONE.test(digitos)) return null;
  return aplicarNonoDigito(digitos);
}

/**
 * Telefone final de um contato: se o id for "@c.us" usa extrairDigitos(id); senão (por exemplo
 * "@lid") usa normalizarTelefone(telefoneResolvido), que pode vir da resolução de LID (lid.ts).
 */
export function telefoneDeId(id: string, telefoneResolvido?: string | null): string | null {
  if (classificarId(id) === "c.us") return extrairDigitos(id);
  if (classificarId(id) !== "lid") return null;
  return normalizarTelefone(telefoneResolvido);
}
