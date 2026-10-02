import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SEM_RESPONSAVEL,
  listarEstagios,
  listarOrigensOpcoes,
  listarPessoas,
  listarUsuariosOpcoes,
} from "@/consultas/pessoas";
import { formatarData, formatarDataHora, formatarTelefone } from "@/lib/formatacao";
import { exigirSessao } from "@/lib/sessao";
import { BotaoNovoLead } from "./componentes";
import { lerFiltrosLeads, linkPagina, type ParametrosBusca } from "./filtros";

export const metadata: Metadata = { title: "Leads | Sistema de Leads Gestão Life" };

const POR_PAGINA = 50;

export default async function PaginaLeads({
  searchParams,
}: {
  searchParams: Promise<ParametrosBusca>;
}) {
  await exigirSessao();
  const { valores, filtros, pagina } = lerFiltrosLeads(await searchParams);

  const [resultado, estagios, origens, usuarios] = await Promise.all([
    listarPessoas(filtros, { pagina, porPagina: POR_PAGINA }),
    listarEstagios(),
    listarOrigensOpcoes(),
    listarUsuariosOpcoes(),
  ]);
  const { linhas, total } = resultado;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const inicio = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const fim = Math.min(pagina * POR_PAGINA, total);
  const temFiltro = Object.values(valores).some(Boolean);

  return (
    <div className="grid gap-6" data-largura="total">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-muted-foreground text-sm">
            Todas as pessoas, do último contato mais recente para o mais antigo.
          </p>
        </div>
        <BotaoNovoLead />
      </div>

      <Card>
        <CardContent>
          <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="f-busca">Busca</Label>
              <Input
                id="f-busca"
                name="busca"
                defaultValue={valores.busca}
                placeholder="Nome, telefone ou e-mail"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-origem">Origem</Label>
              <NativeSelect id="f-origem" name="origem" defaultValue={valores.origem} className="w-full">
                <NativeSelectOption value="">Todas</NativeSelectOption>
                {origens.map((o) => (
                  <NativeSelectOption key={o.id} value={o.id}>
                    {o.nome}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-cidade">Cidade</Label>
              <Input id="f-cidade" name="cidade" defaultValue={valores.cidade} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-estagio">Estágio</Label>
              <NativeSelect id="f-estagio" name="estagio" defaultValue={valores.estagio} className="w-full">
                <NativeSelectOption value="">Todos</NativeSelectOption>
                {estagios.map((e) => (
                  <NativeSelectOption key={e.id} value={e.id}>
                    {e.nome}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-responsavel">Responsável</Label>
              <NativeSelect
                id="f-responsavel"
                name="responsavel"
                defaultValue={valores.responsavel}
                className="w-full"
              >
                <NativeSelectOption value="">Todos</NativeSelectOption>
                <NativeSelectOption value={SEM_RESPONSAVEL}>Sem responsável</NativeSelectOption>
                {usuarios.map((u) => (
                  <NativeSelectOption key={u.id} value={u.id}>
                    {u.nome}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-de">Primeiro contato de</Label>
              <Input id="f-de" name="de" type="date" defaultValue={valores.de} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-ate">até</Label>
              <Input id="f-ate" name="ate" type="date" defaultValue={valores.ate} />
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
              <Button type="submit">Filtrar</Button>
              {temFiltro ? (
                <Button variant="outline" asChild>
                  <Link href="/leads">Limpar filtros</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4">
          <p className="text-muted-foreground text-sm" role="status">
            {total === 0
              ? "Nenhum lead encontrado."
              : `${inicio} a ${fim} de ${total} ${total === 1 ? "lead" : "leads"}`}
          </p>
          {linhas.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Estágio</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Primeiro contato</TableHead>
                  <TableHead>Último contato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      <Link href={`/pessoas/${l.id}`} className="underline-offset-4 hover:underline">
                        {l.nome || "Sem nome"}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {l.telefone ? formatarTelefone(l.telefone) : ""}
                    </TableCell>
                    <TableCell>{l.email ?? ""}</TableCell>
                    <TableCell>{l.estagioNome ?? "Sem estágio"}</TableCell>
                    <TableCell>{l.origemNome ?? "Desconhecida"}</TableCell>
                    <TableCell>{l.cidade ?? ""}</TableCell>
                    <TableCell>{l.responsavelNome ?? ""}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatarData(l.primeiroContatoEm)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatarDataHora(l.ultimoContatoEm, "")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {totalPaginas > 1 ? (
            <nav className="flex items-center justify-between gap-3" aria-label="Paginação">
              {pagina > 1 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={linkPagina(valores, pagina - 1)}>Anterior</Link>
                </Button>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground text-sm">{`Página ${pagina} de ${totalPaginas}`}</span>
              {pagina < totalPaginas ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={linkPagina(valores, pagina + 1)}>Próxima</Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
