import type { Metadata } from "next";
import Link from "next/link";
import { BarrasHorizontais, Colunas } from "@/components/app/graficos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  LIMITE_SEM_RESPOSTA,
  conversaoPorEstagio,
  leadsPorCidade,
  leadsPorDia,
  leadsPorOrigem,
  leadsSemResposta,
  primeiraRespostaPorNumero,
  primeiroEUltimoToquePorOrigem,
} from "@/consultas/painel";
import { listarOrigensOpcoes } from "@/consultas/pessoas";
import { formatarDia, formatarDuracao, formatarTelefone } from "@/lib/formatacao";
import { exigirPapel } from "@/lib/sessao";
import { lerFiltrosPainel, type ParametrosBusca } from "./filtros";

export const metadata: Metadata = { title: "Painel | Sistema de Leads Gestão Life" };

const numero = new Intl.NumberFormat("pt-BR");
const porcentagem = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

function Vazio({ children = "Nenhum lead no período." }: { children?: React.ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

/** Tabela com os números do gráfico, recolhida por padrão (acessibilidade e conferência). */
function TabelaRecolhida({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="text-sm">
      <summary className="text-muted-foreground cursor-pointer select-none">{titulo}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export default async function PaginaPainel({
  searchParams,
}: {
  searchParams: Promise<ParametrosBusca>;
}) {
  await exigirPapel("gestao");
  const { valores, filtros, dias } = lerFiltrosPainel(await searchParams);

  const [origens, porOrigem, porCidade, porDia, toques, funil, respostas, semResposta] =
    await Promise.all([
      listarOrigensOpcoes(),
      leadsPorOrigem(filtros),
      leadsPorCidade(filtros),
      leadsPorDia(filtros),
      primeiroEUltimoToquePorOrigem(filtros),
      conversaoPorEstagio(filtros),
      primeiraRespostaPorNumero(filtros),
      leadsSemResposta(filtros),
    ]);
  const totalLeads = funil.totalLeads;
  const agora = new Date();
  const temFiltro = Boolean(valores.cidade || valores.origem);
  const cidadesConhecidas = porCidade.filter((c) => c.cidade).map((c) => c.cidade!);

  return (
    <div className="grid gap-6" data-largura="total">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
        <p className="text-muted-foreground text-sm">
          Leads do período são as pessoas cujo primeiro contato caiu entre as datas escolhidas
          (horário de Brasília). Pessoas mescladas não contam.
        </p>
      </div>

      <Card>
        <CardContent>
          <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="grid gap-2">
              <Label htmlFor="p-de">De</Label>
              <Input id="p-de" name="de" type="date" defaultValue={valores.de} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-ate">Até</Label>
              <Input id="p-ate" name="ate" type="date" defaultValue={valores.ate} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-cidade">Cidade</Label>
              <Input
                id="p-cidade"
                name="cidade"
                list="p-cidades"
                defaultValue={valores.cidade}
                placeholder="Todas"
              />
              <datalist id="p-cidades">
                {cidadesConhecidas.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-origem">Origem (1º toque)</Label>
              <NativeSelect id="p-origem" name="origem" defaultValue={valores.origem} className="w-full">
                <NativeSelectOption value="">Todas</NativeSelectOption>
                {origens.map((o) => (
                  <NativeSelectOption key={o.id} value={o.id}>
                    {o.nome}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit">Aplicar</Button>
              <Button variant="outline" asChild>
                <Link href="/painel">Últimos 30 dias</Link>
              </Button>
            </div>
          </form>
          <p className="text-muted-foreground mt-3 text-sm" role="status">
            {`${numero.format(totalLeads)} ${totalLeads === 1 ? "lead" : "leads"} em ${dias} ${dias === 1 ? "dia" : "dias"}${temFiltro ? " (com filtro)" : ""}.`}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Leads por origem</CardTitle>
            <CardDescription>Origem do primeiro toque de cada lead do período.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {porOrigem.length === 0 ? (
              <Vazio />
            ) : (
              <>
                <BarrasHorizontais
                  titulo="Leads por origem do primeiro toque"
                  itens={porOrigem.map((o) => ({
                    rotulo: o.nome,
                    valor: o.total,
                    texto: `${numero.format(o.total)} (${porcentagem.format(totalLeads ? o.total / totalLeads : 0)})`,
                  }))}
                />
                <TabelaRecolhida titulo="Ver tabela">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Origem</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">% do total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {porOrigem.map((o) => (
                        <TableRow key={o.origemId ?? "sem"}>
                          <TableCell className="whitespace-normal">{o.nome}</TableCell>
                          <TableCell className="text-right tabular-nums">{numero.format(o.total)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {porcentagem.format(totalLeads ? o.total / totalLeads : 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabelaRecolhida>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads por cidade</CardTitle>
            <CardDescription>
              Cidade do primeiro formulário com cidade; sem formulário, a cidade da origem.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {porCidade.length === 0 ? (
              <Vazio />
            ) : (
              <>
                <BarrasHorizontais
                  titulo="Leads por cidade"
                  itens={porCidade.map((c) => ({ rotulo: c.cidade ?? "Sem cidade", valor: c.total }))}
                />
                <TabelaRecolhida titulo="Ver tabela">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cidade</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {porCidade.map((c) => (
                        <TableRow key={c.cidade ?? "sem"}>
                          <TableCell>{c.cidade ?? "Sem cidade"}</TableCell>
                          <TableCell className="text-right tabular-nums">{numero.format(c.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabelaRecolhida>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leads por dia</CardTitle>
          <CardDescription>Dia do primeiro contato (horário de Brasília).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {totalLeads === 0 ? (
            <Vazio />
          ) : (
            <>
              <Colunas
                titulo="Leads por dia do primeiro contato"
                itens={porDia.map((d) => ({
                  rotulo: formatarDia(d.dia),
                  rotuloCurto: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`,
                  valor: d.total,
                }))}
              />
              <TabelaRecolhida titulo="Ver tabela">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dia</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porDia.map((d) => (
                      <TableRow key={d.dia}>
                        <TableCell>{formatarDia(d.dia)}</TableCell>
                        <TableCell className="text-right tabular-nums">{numero.format(d.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabelaRecolhida>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Primeiro x último toque</CardTitle>
            <CardDescription>
              Quantos leads do período têm cada origem como primeiro toque e como último toque
              (o último antes da venda, se houver).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {toques.length === 0 ? (
              <Vazio>Nenhum toque com origem no período.</Vazio>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Como 1º toque</TableHead>
                    <TableHead className="text-right">Como último toque</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {toques.map((t) => (
                    <TableRow key={t.origemId}>
                      <TableCell className="whitespace-normal">{t.nome}</TableCell>
                      <TableCell className="text-right tabular-nums">{numero.format(t.primeiro)}</TableCell>
                      <TableCell className="text-right tabular-nums">{numero.format(t.ultimo)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversão por estágio</CardTitle>
            <CardDescription>
              Quantos leads do período passaram por cada estágio (percentual sobre o total) e
              quantos estão nele hoje.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {totalLeads === 0 ? (
              <Vazio />
            ) : (
              <>
                <BarrasHorizontais
                  titulo="Leads que passaram por cada estágio"
                  maximo={totalLeads}
                  itens={funil.estagios.map((e) => ({
                    rotulo: e.nome,
                    valor: e.passaram,
                    texto: `${numero.format(e.passaram)} (${porcentagem.format(e.percentual)})`,
                  }))}
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estágio</TableHead>
                      <TableHead className="text-right">Passaram</TableHead>
                      <TableHead className="text-right">% do total</TableHead>
                      <TableHead className="text-right">Estão hoje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {funil.estagios.map((e) => (
                      <TableRow key={e.estagioId}>
                        <TableCell>{e.nome}</TableCell>
                        <TableCell className="text-right tabular-nums">{numero.format(e.passaram)}</TableCell>
                        <TableCell className="text-right tabular-nums">{porcentagem.format(e.percentual)}</TableCell>
                        <TableCell className="text-right tabular-nums">{numero.format(e.hoje)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tempo de primeira resposta por número</CardTitle>
          <CardDescription>
            Em cada conversa, o tempo entre a primeira mensagem recebida e a primeira enviada
            depois dela. Entram as conversas cuja primeira mensagem recebida caiu no período.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {respostas.length === 0 ? (
            <Vazio>Nenhuma conversa iniciada no período.</Vazio>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead className="text-right">Conversas</TableHead>
                  <TableHead className="text-right">Respondidas</TableHead>
                  <TableHead className="text-right">Média</TableHead>
                  <TableHead className="text-right">Mediana</TableHead>
                  <TableHead className="text-right">Sem resposta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {respostas.map((r) => (
                  <TableRow key={r.numeroMonitorado}>
                    <TableCell>
                      <span className="tabular-nums">{formatarTelefone(r.numeroMonitorado)}</span>
                      {r.apelido ? <span className="text-muted-foreground">{` (${r.apelido})`}</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{numero.format(r.chats)}</TableCell>
                    <TableCell className="text-right tabular-nums">{numero.format(r.respondidos)}</TableCell>
                    <TableCell className="text-right">{r.mediaMs === null ? "-" : formatarDuracao(r.mediaMs)}</TableCell>
                    <TableCell className="text-right">{r.medianaMs === null ? "-" : formatarDuracao(r.medianaMs)}</TableCell>
                    <TableCell className="text-right tabular-nums">{numero.format(r.semResposta)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leads sem resposta</CardTitle>
          <CardDescription>
            {`Situação de agora (não depende do período): quem mandou mensagem e ainda não teve resposta, de quem espera há mais tempo. Até ${LIMITE_SEM_RESPOSTA}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {semResposta.length === 0 ? (
            <Vazio>Ninguém esperando resposta.</Vazio>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Estágio</TableHead>
                  <TableHead className="text-right">Esperando há</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {semResposta.map((p) => (
                  <TableRow key={p.pessoaId}>
                    <TableCell className="font-medium">
                      <Link href={`/pessoas/${p.pessoaId}`} className="underline-offset-4 hover:underline">
                        {p.nome || "Sem nome"}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{p.telefone ? formatarTelefone(p.telefone) : ""}</TableCell>
                    <TableCell>{p.estagioNome ?? "Sem estágio"}</TableCell>
                    <TableCell className="text-right">
                      {formatarDuracao(agora.getTime() - p.aguardandoDesde.getTime())}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
