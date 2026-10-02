import { after } from "next/server";

// Agenda trabalho para DEPOIS da resposta HTTP (webhook da Meta, que exige resposta em poucos
// segundos). Usa `after()` do Next: na Vercel ele estende a vida da função com `waitUntil`
// até a tarefa terminar, respeitando o `maxDuration` da rota.
//
// Fallback: fora de um request do Next (testes, scripts) `after()` lança "called outside a
// request scope"; aí a tarefa roda na hora, antes de devolver. Nos dois casos a tarefa deve
// tratar os próprios erros (o que ela não tratar só é registrado no log).

export async function executarDepois(tarefa: () => Promise<void>): Promise<"depois" | "agora"> {
  const segura = async () => {
    try {
      await tarefa();
    } catch (erro) {
      console.error("Falha na tarefa agendada:", erro instanceof Error ? erro.message : erro);
    }
  };
  try {
    after(segura);
    return "depois";
  } catch {
    await segura();
    return "agora";
  }
}
