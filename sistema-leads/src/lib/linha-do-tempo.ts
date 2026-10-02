import { chaveDia, formatarDuracao, formatarTelefone } from "./formatacao";

// Funções puras da linha do tempo da pessoa (sem banco, sem Next): agregação das mensagens
// por dia e descrição dos eventos em pt-BR. Testadas em linha-do-tempo.test.ts.

export type MensagemResumo = {
  numeroMonitorado: string;
  chatId: string;
  direcao: "in" | "out";
  enviadaEm: Date;
  textoAbertura?: string | null;
};

export type DiaMensagens = {
  /** Dia no horário de Brasília, "AAAA-MM-DD". */
  dia: string;
  numeroMonitorado: string;
  recebidas: number;
  enviadas: number;
  /**
   * Tempo entre a primeira mensagem recebida do dia e a primeira enviada depois dela no mesmo
   * chat (em qualquer dia). Null se não houve recebida no dia ou se ainda não houve resposta.
   */
  primeiraRespostaMs: number | null;
  /** Houve recebida no dia e nenhuma enviada depois dela no mesmo chat. */
  semResposta: boolean;
  /** Textos de abertura (única parte de conteúdo que guardamos), na ordem em que chegaram. */
  textosAbertura: string[];
  primeiraEm: Date;
  ultimaEm: Date;
};

/**
 * Agrupa as mensagens por dia (horário de Brasília) e por número monitorado, com contagem de
 * recebidas e enviadas e o tempo da 1ª resposta. Resultado do mais recente para o mais antigo.
 */
export function agregarMensagensPorDia(mensagens: MensagemResumo[]): DiaMensagens[] {
  const ordenadas = [...mensagens].sort((a, b) => a.enviadaEm.getTime() - b.enviadaEm.getTime());

  // Enviadas por chat, em ordem, para achar a primeira resposta posterior.
  const enviadasPorChat = new Map<string, Date[]>();
  const chaveChat = (m: MensagemResumo) => `${m.numeroMonitorado}\u0000${m.chatId}`;
  for (const m of ordenadas) {
    if (m.direcao !== "out") continue;
    const lista = enviadasPorChat.get(chaveChat(m)) ?? [];
    lista.push(m.enviadaEm);
    enviadasPorChat.set(chaveChat(m), lista);
  }

  const grupos = new Map<string, { dia: DiaMensagens; primeiraRecebida: MensagemResumo | null }>();
  for (const m of ordenadas) {
    const dia = chaveDia(m.enviadaEm);
    const chave = `${dia}\u0000${m.numeroMonitorado}`;
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = {
        dia: {
          dia,
          numeroMonitorado: m.numeroMonitorado,
          recebidas: 0,
          enviadas: 0,
          primeiraRespostaMs: null,
          semResposta: false,
          textosAbertura: [],
          primeiraEm: m.enviadaEm,
          ultimaEm: m.enviadaEm,
        },
        primeiraRecebida: null,
      };
      grupos.set(chave, grupo);
    }
    const g = grupo.dia;
    if (m.direcao === "in") {
      g.recebidas++;
      grupo.primeiraRecebida ??= m;
    } else {
      g.enviadas++;
    }
    if (m.textoAbertura) g.textosAbertura.push(m.textoAbertura);
    g.ultimaEm = m.enviadaEm;
  }

  const resultado: DiaMensagens[] = [];
  for (const { dia, primeiraRecebida } of grupos.values()) {
    if (primeiraRecebida) {
      const enviadas = enviadasPorChat.get(chaveChat(primeiraRecebida)) ?? [];
      const resposta = enviadas.find((e) => e.getTime() >= primeiraRecebida.enviadaEm.getTime());
      if (resposta) dia.primeiraRespostaMs = resposta.getTime() - primeiraRecebida.enviadaEm.getTime();
      else dia.semResposta = true;
    }
    resultado.push(dia);
  }

  return resultado.sort(
    (a, b) =>
      b.ultimaEm.getTime() - a.ultimaEm.getTime() ||
      a.numeroMonitorado.localeCompare(b.numeroMonitorado),
  );
}

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

/** "12 recebidas, 9 enviadas, 1ª resposta em 4 min" (ou "..., sem resposta"). */
export function descreverDiaMensagens(dia: DiaMensagens): string {
  const partes = [
    plural(dia.recebidas, "recebida", "recebidas"),
    plural(dia.enviadas, "enviada", "enviadas"),
  ];
  if (dia.primeiraRespostaMs !== null) {
    partes.push(`1ª resposta em ${formatarDuracao(dia.primeiraRespostaMs)}`);
  } else if (dia.semResposta) {
    partes.push("sem resposta");
  }
  return partes.join(", ");
}

export type EventoParaDescrever = {
  tipo: string;
  canal: string | null;
  dados: unknown;
  numeroMonitorado?: string | null;
  /** Nome de quem fez, quando a ação foi manual. */
  usuarioNome?: string | null;
  origemNome?: string | null;
};

export type DescricaoEvento = {
  titulo: string;
  /** Linhas de detalhe (curtas). */
  detalhes: string[];
  /** Texto de abertura do WhatsApp, quando houver (mostrado identificado como tal). */
  textoAbertura?: string;
  /** "por Fulano" quando a ação foi manual. */
  autor?: string;
};

const ROTULO_CANAL: Record<string, string> = {
  whatsapp: "WhatsApp",
  meta_form: "formulário da Meta",
  lp_form: "formulário da LP",
  hotmart: "Hotmart",
  presencial: "presencial",
  manual: "lançamento manual",
};

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function texto(valor: unknown): string | null {
  if (typeof valor === "string") return valor.trim() || null;
  if (typeof valor === "number") return String(valor);
  return null;
}

/** Nome de um lado de/para: aceita `de_nome` ou `de: { nome }`. */
function nomeLado(dados: Record<string, unknown>, lado: "de" | "para"): string | null {
  return texto(dados[`${lado}_nome`]) ?? texto(objeto(dados[lado]).nome);
}

function formatarValorCentavos(valor: unknown): string | null {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return null;
  return (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Descrição em pt-BR de um evento da linha do tempo, por tipo. */
export function descreverEvento(evento: EventoParaDescrever): DescricaoEvento {
  const dados = objeto(evento.dados);
  const detalhes: string[] = [];
  const autor = evento.usuarioNome ? `por ${evento.usuarioNome}` : undefined;
  const origem = evento.origemNome ? `Origem: ${evento.origemNome}` : null;
  let titulo: string;
  let textoAbertura: string | undefined;

  switch (evento.tipo) {
    case "form_enviado": {
      titulo =
        evento.canal === "meta_form"
          ? "Formulário da Meta enviado"
          : evento.canal === "lp_form"
            ? "Formulário da LP enviado"
            : "Formulário enviado";
      if (origem) detalhes.push(origem);
      if (dados.reatribuicao === true) detalhes.push("Origem atribuída no reprocessamento");
      const cidade = texto(dados.cidade) ?? texto(objeto(dados.campos).cidade);
      if (cidade) detalhes.push(`Cidade: ${cidade}`);
      const campanha = texto(dados.utm_campaign);
      if (campanha) detalhes.push(`Campanha (UTM): ${campanha}`);
      break;
    }
    case "conversa_iniciada": {
      titulo = "Conversa iniciada no WhatsApp";
      if (evento.numeroMonitorado) detalhes.push(`Número: ${formatarTelefone(evento.numeroMonitorado)}`);
      if (origem) detalhes.push(origem);
      if (dados.reatribuicao === true) detalhes.push("Origem atribuída no reprocessamento");
      textoAbertura = texto(dados.texto_abertura) ?? undefined;
      break;
    }
    case "estagio_alterado": {
      const de = nomeLado(dados, "de");
      const para = nomeLado(dados, "para") ?? "estágio desconhecido";
      titulo = de ? `Estágio alterado de ${de} para ${para}` : `Entrou no estágio ${para}`;
      if (dados.automatico === true) detalhes.push("Movimento automático");
      const motivo = texto(dados.motivo_perda);
      if (motivo) detalhes.push(`Motivo da perda: ${motivo}`);
      break;
    }
    case "responsavel_alterado": {
      const de = nomeLado(dados, "de") ?? "ninguém";
      const para = nomeLado(dados, "para") ?? "ninguém";
      titulo = `Responsável alterado de ${de} para ${para}`;
      break;
    }
    case "reuniao_agendada":
      titulo = "Reunião agendada";
      break;
    case "ingresso_comprado":
      titulo = "Ingresso comprado";
      break;
    case "checkin_evento":
      titulo = "Check-in no evento";
      break;
    case "venda_registrada": {
      titulo = "Venda registrada";
      const produto = texto(dados.produto);
      if (produto) detalhes.push(`Produto: ${produto}`);
      const valor = dados.valor_centavos !== undefined ? formatarValorCentavos(dados.valor_centavos) : null;
      if (valor) detalhes.push(`Valor: ${valor}`);
      break;
    }
    case "identidade_mesclada": {
      titulo = "Identidade mesclada";
      const absorvida = texto(dados.absorvida_nome);
      detalhes.push(absorvida ? `Absorveu a pessoa ${absorvida}` : "Absorveu outra pessoa");
      const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
      detalhes.push(
        `Movidos: ${n(dados.identificadores_movidos)} identificadores, ${n(dados.eventos_movidos)} eventos, ${n(dados.mensagens_movidas)} mensagens`,
      );
      break;
    }
    case "nota": {
      // `texto` é o formato atual; `nota` é o das entradas manuais antigas.
      const nota = texto(dados.texto) ?? texto(dados.nota);
      if (nota) {
        titulo = "Nota";
        detalhes.push(nota);
      } else {
        titulo = "Lead cadastrado manualmente";
      }
      break;
    }
    default:
      titulo = `Evento ${evento.tipo}`;
  }

  if (evento.canal && evento.tipo !== "nota" && evento.canal !== "manual" && ROTULO_CANAL[evento.canal]) {
    // O canal já está implícito no título dos formulários e da conversa.
    if (!["form_enviado", "conversa_iniciada"].includes(evento.tipo)) {
      detalhes.push(`Canal: ${ROTULO_CANAL[evento.canal]}`);
    }
  }

  return { titulo, detalhes, textoAbertura, autor };
}
