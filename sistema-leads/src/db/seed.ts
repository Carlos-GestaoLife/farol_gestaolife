import { criarClienteNode } from "./client-node";
import { estagios, origens } from "./schema";

// Seed idempotente: pode rodar quantas vezes quiser. Linhas já existentes são ignoradas
// (ON CONFLICT DO NOTHING por `estagios.nome` e `origens.codigo`).

const ESTAGIOS: (typeof estagios.$inferInsert)[] = [
  { nome: "Novo lead", ordem: 1, tipo: "aberto", gatilhoAutomatico: null },
  { nome: "Em conversa", ordem: 2, tipo: "aberto", gatilhoAutomatico: "conversa_iniciada" },
  { nome: "Qualificado", ordem: 3, tipo: "aberto", gatilhoAutomatico: null },
  { nome: "Reunião agendada", ordem: 4, tipo: "aberto", gatilhoAutomatico: "reuniao_agendada" },
  { nome: "Ingresso comprado", ordem: 5, tipo: "aberto", gatilhoAutomatico: "ingresso_comprado" },
  { nome: "Participou do evento", ordem: 6, tipo: "aberto", gatilhoAutomatico: "checkin_evento" },
  { nome: "Negociação", ordem: 7, tipo: "aberto", gatilhoAutomatico: null },
  { nome: "Cliente Gestão PRO", ordem: 8, tipo: "ganho", gatilhoAutomatico: "venda_registrada" },
  { nome: "Perdido", ordem: 9, tipo: "perdido", gatilhoAutomatico: null },
];

const ORIGEM_DESCONHECIDA: typeof origens.$inferInsert = {
  codigo: "desconhecida",
  nome: "WhatsApp direto (desconhecida)",
  tipo: "desconhecida",
  ativo: true,
  criadaAutomaticamente: false,
};

async function main() {
  const { db, pool } = criarClienteNode();
  try {
    const estagiosInseridos = await db
      .insert(estagios)
      .values(ESTAGIOS)
      .onConflictDoNothing({ target: estagios.nome })
      .returning({ id: estagios.id });
    console.log(
      `Estágios: ${estagiosInseridos.length} inseridos, ${ESTAGIOS.length - estagiosInseridos.length} já existiam (ignorados).`,
    );

    const origensInseridas = await db
      .insert(origens)
      .values(ORIGEM_DESCONHECIDA)
      .onConflictDoNothing({ target: origens.codigo })
      .returning({ id: origens.id });
    console.log(
      `Origens: ${origensInseridas.length} inseridas, ${1 - origensInseridas.length} já existiam (ignoradas).`,
    );

    console.log("Seed concluído.");
  } finally {
    await pool.end();
  }
}

main().catch((erro) => {
  console.error("Falha no seed:", erro);
  process.exit(1);
});
