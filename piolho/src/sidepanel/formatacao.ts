// Formatação de exibição no painel.

/** "5562999998888" -> "+55 (62) 99999-8888"; fixo de 12 dígitos -> "+55 (62) 3234-5678"; resto -> "+dígitos". */
export function formatarTelefone(digitos: string): string {
  if (/^55\d{11}$/.test(digitos)) {
    return `+55 (${digitos.slice(2, 4)}) ${digitos.slice(4, 9)}-${digitos.slice(9)}`;
  }
  if (/^55\d{10}$/.test(digitos)) {
    return `+55 (${digitos.slice(2, 4)}) ${digitos.slice(4, 8)}-${digitos.slice(8)}`;
  }
  return `+${digitos}`;
}

/** "agora", "há 12 s", "há 3 min", "há 2 h", "há 4 dias". Futuro: "em 2 min". Pura. */
export function tempoRelativo(iso: string, agora: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "?";
  const diff = agora - t;
  const futuro = diff < 0;
  const s = Math.round(Math.abs(diff) / 1000);
  let texto: string;
  if (s < 5) return "agora";
  if (s < 60) texto = `${s} s`;
  else if (s < 3600) texto = `${Math.round(s / 60)} min`;
  else if (s < 86400) texto = `${Math.round(s / 3600)} h`;
  else {
    const dias = Math.round(s / 86400);
    texto = `${dias} ${dias === 1 ? "dia" : "dias"}`;
  }
  return futuro ? `em ${texto}` : `há ${texto}`;
}

/** "03/10/2026 14:03" no fuso do computador. */
export function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const NOMES_ERRO: Record<string, string> = {
  token_invalido: "token inválido",
  erro_cliente: "pedido recusado",
  erro_servidor: "erro no sistema",
  rede: "sem conexão",
  resposta_invalida: "resposta inesperada",
};

/** Nome curto do tipo de erro, para o painel. */
export function nomeErro(tipo: string): string {
  return NOMES_ERRO[tipo] ?? tipo;
}

/** "14:05" no fuso do computador. */
export function formatarHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** wa_msg_id abreviado para a lista de rejeitados: começo e fim, com reticências no meio. Pura. */
export function abreviarId(id: string, inicio: number = 8, fim: number = 10): string {
  return id.length <= inicio + fim + 3 ? id : `${id.slice(0, inicio)}...${id.slice(-fim)}`;
}

/** Texto do progresso: "Varrendo chat 12 de 40, 350 itens enfileirados". Pura. */
export function textoProgressoVarredura(v: {
  situacao: string;
  chats_total: number;
  chats_processados: number;
  itens_enfileirados: number;
}): string {
  const itens = `${v.itens_enfileirados} ${v.itens_enfileirados === 1 ? "item enfileirado" : "itens enfileirados"}`;
  switch (v.situacao) {
    case "pedida":
      return "Varredura pedida, aguardando o WhatsApp...";
    case "rodando":
      return v.chats_total === 0
        ? "Listando as conversas..."
        : `Varrendo chat ${Math.min(v.chats_processados + 1, v.chats_total)} de ${v.chats_total}, ${itens}`;
    case "concluida":
      return `Varredura concluída: ${v.chats_total} ${v.chats_total === 1 ? "chat" : "chats"}, ${itens}`;
    case "cancelada":
      return `Varredura cancelada em ${v.chats_processados} de ${v.chats_total} chats, ${itens}`;
    default:
      return `Varredura com erro em ${v.chats_processados} de ${v.chats_total} chats, ${itens}`;
  }
}
