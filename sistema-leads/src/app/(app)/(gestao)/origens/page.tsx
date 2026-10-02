import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listarOrigensComContagem, type OrigemComContagem } from "@/consultas/origens";
import { ROTULO_TIPO_ORIGEM } from "@/lib/origens";
import { exigirPapel } from "@/lib/sessao";
import { BotaoAtivoOrigem, BotaoRecalcular } from "./componentes";

export const metadata: Metadata = { title: "Origens | Sistema de Leads Gestão Life" };

function Linhas({ itens }: { itens: (string | null)[] }) {
  const preenchidos = itens.filter(Boolean);
  if (preenchidos.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="grid gap-0.5 text-xs">
      {preenchidos.map((t) => (
        <span key={t} className="break-all">
          {t}
        </span>
      ))}
    </div>
  );
}

function LinhaOrigem({ o }: { o: OrigemComContagem }) {
  return (
    <TableRow className={o.ativo ? undefined : "text-muted-foreground"}>
      <TableCell className="max-w-48 min-w-36 font-mono text-xs whitespace-normal">
        <Link href={`/origens/${o.id}`} className="underline-offset-4 hover:underline">
          {o.codigo}
        </Link>
      </TableCell>
      <TableCell className="min-w-40 font-medium whitespace-normal">
        <Link href={`/origens/${o.id}`} className="underline-offset-4 hover:underline">
          {o.nome}
        </Link>
      </TableCell>
      <TableCell className="text-xs whitespace-normal">{ROTULO_TIPO_ORIGEM[o.tipo]}</TableCell>
      <TableCell className="text-right tabular-nums">{o.leads}</TableCell>
      <TableCell className="text-right tabular-nums">{o.toques}</TableCell>
      <TableCell>
        <div className="grid justify-items-start gap-1">
          {o.ativo ? (
            <Badge variant="secondary">Ativa</Badge>
          ) : (
            <Badge variant="outline">Inativa</Badge>
          )}
          <BotaoAtivoOrigem id={o.id} ativo={o.ativo} />
        </div>
      </TableCell>
      <TableCell className="max-w-56 text-xs whitespace-normal">
        {o.padraoTexto ?? <span className="text-muted-foreground">-</span>}
      </TableCell>
      <TableCell>
        <Linhas
          itens={[
            o.metaAdId ? `anúncio ${o.metaAdId}` : null,
            o.metaFormId ? `form ${o.metaFormId}` : null,
          ]}
        />
      </TableCell>
      <TableCell>
        <Linhas
          itens={[
            o.utmSource ? `source: ${o.utmSource}` : null,
            o.utmMedium ? `medium: ${o.utmMedium}` : null,
            o.utmCampaign ? `campaign: ${o.utmCampaign}` : null,
          ]}
        />
      </TableCell>
      <TableCell className="text-xs">{o.cidade ?? "-"}</TableCell>
      <TableCell className="text-xs">{o.evento ?? "-"}</TableCell>
      <TableCell className="text-xs">{o.produto ?? "-"}</TableCell>
      <TableCell className="text-xs">{o.criadaAutomaticamente ? "Sim" : "Não"}</TableCell>
    </TableRow>
  );
}

export default async function PaginaOrigens() {
  await exigirPapel("gestao");
  const lista = await listarOrigensComContagem();
  const automaticas = lista.filter((o) => o.criadaAutomaticamente && o.ativo).length;

  return (
    <div className="grid grid-cols-1 gap-6" data-largura="total">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Origens</h1>
          <p className="text-muted-foreground text-sm">
            De onde vem cada lead: anúncios, links e QR Codes do WhatsApp, formulários da Meta e
            LPs.
          </p>
        </div>
        <Button asChild>
          <Link href="/origens/nova">
            <Plus />
            Nova origem
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Origens cadastradas</CardTitle>
          <CardDescription>
            Leads = pessoas cujo primeiro toque veio desta origem. Toques = todos os contatos
            (conversas e formulários) atribuídos a ela.
            {automaticas > 0
              ? ` Há ${automaticas} origem(ns) criada(s) automaticamente: abra e complete o cadastro.`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lista.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma origem cadastrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Toques</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Padrão de texto</TableHead>
                  <TableHead>Meta</TableHead>
                  <TableHead>UTMs</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Automática</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((o) => (
                  <LinhaOrigem key={o.id} o={o} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Primeiro toque</CardTitle>
          <CardDescription>
            A origem de cada toque é definida quando a entrada é processada e o evento nunca muda.
            Este botão recalcula só o primeiro toque guardado em cada pessoa a partir dos eventos.
            Para atribuir uma origem nova a toques antigos, as entradas precisam ser reprocessadas
            (botão previsto na tela Saúde).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BotaoRecalcular />
        </CardContent>
      </Card>
    </div>
  );
}
