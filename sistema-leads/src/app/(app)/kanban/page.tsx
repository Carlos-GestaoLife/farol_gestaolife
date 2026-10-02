import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { LIMITE_POR_COLUNA, carregarKanban } from "@/consultas/kanban";
import { SEM_RESPONSAVEL, listarUsuariosOpcoes } from "@/consultas/pessoas";
import { formatarTelefone, formatarTempoRelativo } from "@/lib/formatacao";
import { exigirSessao } from "@/lib/sessao";
import { Quadro, type ColunaQuadro } from "./quadro";

export const metadata: Metadata = { title: "Kanban | Sistema de Leads Gestão Life" };

type ParametrosBusca = Record<string, string | string[] | undefined>;

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

export default async function PaginaKanban({
  searchParams,
}: {
  searchParams: Promise<ParametrosBusca>;
}) {
  await exigirSessao();
  const params = await searchParams;
  const busca = primeiro(params.busca).slice(0, 200);
  const responsavelBruto = primeiro(params.responsavel);
  const responsavel = /^[\w-]{1,100}$/.test(responsavelBruto) ? responsavelBruto : "";

  const [colunas, usuarios] = await Promise.all([
    carregarKanban({ busca: busca || null, responsavelId: responsavel || null }),
    listarUsuariosOpcoes(),
  ]);

  // Textos calculados no servidor (sem diferença de relógio entre servidor e navegador).
  const agora = new Date();
  const paraQuadro: ColunaQuadro[] = colunas.map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    total: c.total,
    limite: LIMITE_POR_COLUNA,
    cartoes: c.cartoes.map((p) => ({
      id: p.id,
      titulo: p.nome || (p.telefone ? formatarTelefone(p.telefone) : p.email) || "Sem nome",
      telefone: p.telefone ? formatarTelefone(p.telefone) : null,
      origem: p.origemNome ?? "Desconhecida",
      responsavel: p.responsavelNome,
      semResposta: p.aguardandoDesde ? formatarTempoRelativo(p.aguardandoDesde, agora) : null,
    })),
  }));

  return (
    <div className="grid gap-4" data-largura="total">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Kanban</h1>
        <p className="text-muted-foreground text-sm">
          Arraste o cartão para mudar o estágio. Cada mudança fica na linha do tempo com o seu
          usuário e a hora.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="k-busca">Busca</Label>
          <Input
            id="k-busca"
            name="busca"
            defaultValue={busca}
            placeholder="Nome ou telefone"
            className="w-64"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="k-responsavel">Responsável</Label>
          <NativeSelect id="k-responsavel" name="responsavel" defaultValue={responsavel} className="w-52">
            <NativeSelectOption value="">Todos</NativeSelectOption>
            <NativeSelectOption value={SEM_RESPONSAVEL}>Sem responsável</NativeSelectOption>
            {usuarios.map((u) => (
              <NativeSelectOption key={u.id} value={u.id}>
                {u.nome}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit">Filtrar</Button>
        {busca || responsavel ? (
          <Button variant="outline" asChild>
            <Link href="/kanban">Limpar</Link>
          </Button>
        ) : null}
      </form>

      {paraQuadro.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum estágio cadastrado.</p>
      ) : (
        <Quadro colunas={paraQuadro} />
      )}
    </div>
  );
}
