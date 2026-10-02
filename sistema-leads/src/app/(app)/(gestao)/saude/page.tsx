import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LIMITE_ENTRADAS_SAUDE,
  buscarEntradasPorChave,
  listarDispositivosSaude,
  listarEntradasComProblema,
  listarRevisoesAbertas,
  type EntradaSaude,
} from "@/consultas/saude";
import { formatarDataHora, formatarTelefone, formatarTempoRelativo } from "@/lib/formatacao";
import { MINUTOS_ALERTA_SINAL, dispositivoEmAlerta, emHorarioComercial } from "@/lib/horario";
import { exigirPapel } from "@/lib/sessao";
import {
  BotaoReprocessarTodas,
  FilaRevisao,
  LinhaEntradaBusca,
  TabelaEntradasProblema,
  type EntradaTela,
} from "./componentes";

export const metadata: Metadata = { title: "Saúde | Sistema de Leads Gestão Life" };

function paraTela(e: EntradaSaude): EntradaTela {
  return {
    id: e.id,
    fonte: e.fonte,
    chave: e.chaveIdempotencia,
    recebidoEm: formatarDataHora(e.recebidoEm),
    tentativas: e.tentativas,
    erro: e.erro,
    status: e.status,
    processadoEm: e.processadoEm ? formatarDataHora(e.processadoEm) : null,
  };
}

export default async function PaginaSaude({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPapel("gestao");
  const params = await searchParams;
  const chave = (Array.isArray(params.chave) ? params.chave[0] : params.chave)?.trim().slice(0, 500) ?? "";

  const [dispositivos, entradas, revisoes, busca] = await Promise.all([
    listarDispositivosSaude(),
    listarEntradasComProblema(),
    listarRevisoesAbertas(),
    chave ? buscarEntradasPorChave(chave) : Promise.resolve([]),
  ]);
  const agora = new Date();
  const comercial = emHorarioComercial(agora);
  const emAlerta = dispositivos.filter((d) => dispositivoEmAlerta(d, agora)).length;

  return (
    <div className="grid gap-6" data-largura="total">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Saúde</h1>
        <p className="text-muted-foreground text-sm">
          Dispositivos do piolho, entradas que falharam no processamento e conflitos de identidade
          esperando decisão.
        </p>
      </div>

      <Card id="dispositivos">
        <CardHeader>
          <CardTitle>Dispositivos</CardTitle>
          <CardDescription>
            {`Alerta quando o último sinal tem mais de ${MINUTOS_ALERTA_SINAL} min em horário comercial (segunda a sexta, 8h às 19h). Agora ${comercial ? "é" : "não é"} horário comercial.`}{" "}
            <Link href="/dispositivos" className="underline underline-offset-4">
              Gerenciar dispositivos
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {emAlerta > 0 ? (
            <p role="alert" className="text-destructive text-sm font-medium">
              {`${emAlerta} ${emAlerta === 1 ? "dispositivo sem sinal" : "dispositivos sem sinal"}.`}
            </p>
          ) : null}
          {dispositivos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum dispositivo cadastrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Último sinal</TableHead>
                  <TableHead className="text-right">Fila pendente</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispositivos.map((d) => {
                  const alerta = dispositivoEmAlerta(d, agora);
                  return (
                    <TableRow key={d.id} className={d.ativo ? undefined : "text-muted-foreground"}>
                      <TableCell className="font-medium">{d.nome}</TableCell>
                      <TableCell>{d.usuario ?? "-"}</TableCell>
                      <TableCell className="tabular-nums">
                        {d.numeroDetectado ? formatarTelefone(d.numeroDetectado) : "-"}
                      </TableCell>
                      <TableCell title={formatarDataHora(d.ultimoSinalEm)}>
                        <span className="flex items-center gap-2">
                          {formatarTempoRelativo(d.ultimoSinalEm, agora, "Nunca")}
                          {alerta ? <Badge variant="destructive">Sem sinal</Badge> : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{d.filaPendente}</TableCell>
                      <TableCell>{d.versaoExtensao ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={d.ativo ? "secondary" : "outline"}>{d.ativo ? "Ativo" : "Inativo"}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card id="entradas">
        <CardHeader>
          <CardTitle>Entradas com erro ou pendentes</CardTitle>
          <CardDescription>
            {`${entradas.erros} com erro e ${entradas.pendentes} pendentes. Mostrando as ${LIMITE_ENTRADAS_SAUDE} mais recentes. O reprocessamento automático tenta cada uma até 10 vezes.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <BotaoReprocessarTodas />
          <TabelaEntradasProblema entradas={entradas.linhas.map(paraTela)} />
        </CardContent>
      </Card>

      <Card id="busca-entrada">
        <CardHeader>
          <CardTitle>Reprocessar uma entrada já processada</CardTitle>
          <CardDescription>
            Busque pela chave de idempotência (ex.: o leadgen_id da Meta ou numero:wa_msg_id do
            WhatsApp). O reprocessamento forçado serve para reatribuir a origem depois de cadastrar
            uma origem nova.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="grid gap-2">
              <Label htmlFor="s-chave">Chave de idempotência</Label>
              <Input id="s-chave" name="chave" defaultValue={chave} className="w-80 max-w-full" />
            </div>
            <Button type="submit" variant="outline">
              Buscar
            </Button>
          </form>
          {chave ? (
            busca.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma entrada com essa chave.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fonte</TableHead>
                    <TableHead>Chave</TableHead>
                    <TableHead>Recebida em</TableHead>
                    <TableHead>Processada em</TableHead>
                    <TableHead className="text-right">Tentativas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {busca.map((e) => (
                    <LinhaEntradaBusca key={e.id} entrada={paraTela(e)} />
                  ))}
                </TableBody>
              </Table>
            )
          ) : null}
        </CardContent>
      </Card>

      <Card id="revisao">
        <CardHeader>
          <CardTitle>Revisão de identidade</CardTitle>
          <CardDescription>
            Entradas que trouxeram identificadores de duas pessoas diferentes. O sistema não mescla
            sozinho: decida aqui. Também é possível mesclar pela ficha da pessoa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FilaRevisao
            itens={revisoes.map((r) => ({
              id: r.id,
              motivo: r.motivo,
              criadoEm: formatarDataHora(r.criadoEm),
              pessoaA: r.pessoaA
                ? {
                    ...r.pessoaA,
                    telefone: r.pessoaA.telefone ? formatarTelefone(r.pessoaA.telefone) : null,
                    mesclada: Boolean(r.pessoaA.mescladaParaId),
                  }
                : null,
              pessoaB: r.pessoaB
                ? {
                    ...r.pessoaB,
                    telefone: r.pessoaB.telefone ? formatarTelefone(r.pessoaB.telefone) : null,
                    mesclada: Boolean(r.pessoaB.mescladaParaId),
                  }
                : null,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
