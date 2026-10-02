"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { MensagemAcao } from "@/components/app/mensagem-acao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ESTADO_INICIAL, type EstadoAcao } from "@/lib/acoes";
import {
  descartarItemRevisao,
  ignorarEntrada,
  mesclarItemRevisao,
  reprocessarEntrada,
  reprocessarTodas,
  type EstadoReprocessamento,
} from "./acoes";

/** Botão global: reprocessa pendentes e erros e mostra o resumo. */
export function BotaoReprocessarTodas() {
  const [estado, setEstado] = useState<EstadoReprocessamento>(ESTADO_INICIAL);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        disabled={pendente}
        onClick={() => iniciar(async () => setEstado(await reprocessarTodas()))}
      >
        {pendente ? "Reprocessando..." : "Reprocessar pendentes e erros"}
      </Button>
      {estado.resumo ? (
        <p role="status" className="text-sm">
          {`Total: ${estado.resumo.total} · processadas: ${estado.resumo.processadas} · com erro: ${estado.resumo.erros}`}
        </p>
      ) : (
        <MensagemAcao estado={estado} />
      )}
    </div>
  );
}

export type EntradaTela = {
  id: string;
  fonte: string;
  chave: string;
  recebidoEm: string;
  tentativas: number;
  erro: string | null;
  status: string;
  processadoEm: string | null;
};

const ROTULO_STATUS: Record<string, string> = {
  pendente: "Pendente",
  processado: "Processada",
  erro: "Erro",
  ignorado: "Ignorada",
};

function BadgeStatus({ status }: { status: string }) {
  const variante = status === "erro" ? "destructive" : status === "processado" ? "secondary" : "outline";
  return <Badge variant={variante}>{ROTULO_STATUS[status] ?? status}</Badge>;
}

/** Mensagem de erro truncada; clicar mostra o texto inteiro. */
function TextoErro({ erro }: { erro: string | null }) {
  if (!erro) return <span className="text-muted-foreground">-</span>;
  if (erro.length <= 80) return <span className="break-words whitespace-normal">{erro}</span>;
  return (
    <details title={erro} className="max-w-md whitespace-normal">
      <summary className="cursor-pointer break-words">{`${erro.slice(0, 80)}…`}</summary>
      <p className="mt-1 text-xs break-words">{erro}</p>
    </details>
  );
}

/** Linha de uma entrada com erro ou pendente: Reprocessar e Ignorar. */
function LinhaEntradaProblema({
  entrada: e,
  aoConcluir,
}: {
  entrada: EntradaTela;
  /** Chamado com o resultado: a linha pode sumir da lista depois do sucesso. */
  aoConcluir: (mensagem: string, ok: boolean) => void;
}) {
  const [estado, setEstado] = useState<EstadoAcao>(ESTADO_INICIAL);
  const [pendente, iniciar] = useTransition();

  function executar(acao: () => Promise<EstadoAcao>) {
    iniciar(async () => {
      const r = await acao();
      setEstado(r);
      aoConcluir(`${e.fonte} ${e.chave}: ${r.mensagem ?? ""}`, r.ok);
    });
  }

  function ignorar() {
    if (!window.confirm("Ignorar esta entrada? Ela sai da fila de reprocessamento (nada é apagado).")) return;
    executar(() => ignorarEntrada(e.id));
  }

  return (
    <TableRow>
      <TableCell>{e.fonte}</TableCell>
      <TableCell className="max-w-56 font-mono text-xs break-all whitespace-normal">{e.chave}</TableCell>
      <TableCell className="text-muted-foreground">{e.recebidoEm}</TableCell>
      <TableCell className="text-right tabular-nums">{e.tentativas}</TableCell>
      <TableCell className="text-sm">
        <TextoErro erro={e.erro} />
      </TableCell>
      <TableCell>
        <BadgeStatus status={e.status} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pendente}
            onClick={() => executar(() => reprocessarEntrada(e.id, false))}
          >
            Reprocessar
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={pendente} onClick={ignorar}>
            Ignorar
          </Button>
        </div>
        <MensagemAcao estado={estado} className="max-w-xs text-xs" />
      </TableCell>
    </TableRow>
  );
}

/**
 * Tabela das entradas com erro ou pendentes. A última mensagem fica acima da tabela, porque a
 * linha some da lista quando a entrada é processada ou ignorada.
 */
export function TabelaEntradasProblema({ entradas }: { entradas: EntradaTela[] }) {
  const [ultima, setUltima] = useState<EstadoAcao>(ESTADO_INICIAL);
  return (
    <div className="grid gap-2">
      <MensagemAcao estado={ultima} />
      {entradas.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma entrada com erro ou pendente.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fonte</TableHead>
              <TableHead>Chave</TableHead>
              <TableHead>Recebida em</TableHead>
              <TableHead className="text-right">Tentativas</TableHead>
              <TableHead>Erro</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entradas.map((e) => (
              <LinhaEntradaProblema
                key={e.id}
                entrada={e}
                aoConcluir={(mensagem, ok) => setUltima({ ok, mensagem })}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** Linha do resultado da busca por chave: reprocessamento forçado (reatribuição de origem). */
export function LinhaEntradaBusca({ entrada: e }: { entrada: EntradaTela }) {
  const [estado, setEstado] = useState<EstadoAcao>(ESTADO_INICIAL);
  const [pendente, iniciar] = useTransition();

  function forcar() {
    const ok = window.confirm(
      "Reprocessar forçado? A entrada roda de novo mesmo já processada. Nada duplica; um toque que ficou sem origem pode ganhar um evento novo de reatribuição.",
    );
    if (!ok) return;
    iniciar(async () => setEstado(await reprocessarEntrada(e.id, true)));
  }

  return (
    <TableRow>
      <TableCell>{e.fonte}</TableCell>
      <TableCell className="max-w-56 font-mono text-xs break-all whitespace-normal">{e.chave}</TableCell>
      <TableCell className="text-muted-foreground">{e.recebidoEm}</TableCell>
      <TableCell className="text-muted-foreground">{e.processadoEm ?? "-"}</TableCell>
      <TableCell className="text-right tabular-nums">{e.tentativas}</TableCell>
      <TableCell>
        <BadgeStatus status={e.status} />
      </TableCell>
      <TableCell>
        <Button type="button" variant="outline" size="sm" disabled={pendente} onClick={forcar}>
          {pendente ? "Reprocessando..." : "Reprocessar forçado"}
        </Button>
        <MensagemAcao estado={estado} className="max-w-xs text-xs" />
      </TableCell>
    </TableRow>
  );
}

export type PessoaRevisaoTela = {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  estagioNome: string | null;
  eventos: number;
  mensagens: number;
  mesclada: boolean;
};

export type ItemRevisaoTela = {
  id: string;
  motivo: string | null;
  criadoEm: string;
  pessoaA: PessoaRevisaoTela | null;
  pessoaB: PessoaRevisaoTela | null;
};

function nomeDe(p: PessoaRevisaoTela | null): string {
  return p?.nome || p?.telefone || p?.email || "Sem nome";
}

function CartaoPessoa({ rotulo, pessoa }: { rotulo: string; pessoa: PessoaRevisaoTela | null }) {
  if (!pessoa) {
    return (
      <div className="rounded-md border p-3 text-sm">
        <p className="font-medium">{rotulo}</p>
        <p className="text-muted-foreground">Pessoa não encontrada.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-1 rounded-md border p-3 text-sm">
      <p className="font-medium">
        {`${rotulo}: `}
        <Link href={`/pessoas/${pessoa.id}`} className="underline-offset-4 hover:underline">
          {nomeDe(pessoa)}
        </Link>
        {pessoa.mesclada ? (
          <Badge variant="outline" className="ml-2">
            Já mesclada
          </Badge>
        ) : null}
      </p>
      <p className="text-muted-foreground tabular-nums">{`Telefone: ${pessoa.telefone ?? "-"}`}</p>
      <p className="text-muted-foreground break-all">{`E-mail: ${pessoa.email ?? "-"}`}</p>
      <p className="text-muted-foreground">{`Estágio: ${pessoa.estagioNome ?? "Sem estágio"}`}</p>
      <p className="text-muted-foreground">{`${pessoa.eventos} eventos, ${pessoa.mensagens} mensagens`}</p>
    </div>
  );
}

type Pedido = { sobrevivente: PessoaRevisaoTela; absorvida: PessoaRevisaoTela } | null;

/**
 * Fila de revisão de identidade. O resultado da última ação fica acima da lista, porque o item
 * resolvido some dela.
 */
export function FilaRevisao({ itens }: { itens: ItemRevisaoTela[] }) {
  const [ultima, setUltima] = useState<EstadoAcao>(ESTADO_INICIAL);
  return (
    <div className="grid gap-3">
      {ultima.mensagem ? (
        <div className="flex flex-wrap items-center gap-3">
          <MensagemAcao estado={ultima} />
          {ultima.ok && ultima.link ? (
            <Link href={ultima.link} className="text-sm underline underline-offset-4">
              Abrir a pessoa que ficou
            </Link>
          ) : null}
        </div>
      ) : null}
      {itens.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum conflito aberto.</p>
      ) : (
        <ul className="grid gap-4">
          {itens.map((item) => (
            <ItemFilaRevisao key={item.id} item={item} aoConcluir={setUltima} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Item aberto da fila de revisão: mesclar (com confirmação) ou descartar. */
function ItemFilaRevisao({
  item,
  aoConcluir,
}: {
  item: ItemRevisaoTela;
  aoConcluir: (estado: EstadoAcao) => void;
}) {
  const [estado, setEstado] = useState<EstadoAcao>(ESTADO_INICIAL);
  const [pedido, setPedido] = useState<Pedido>(null);
  const [pendente, iniciar] = useTransition();
  const { pessoaA: a, pessoaB: b } = item;

  function mesclar() {
    if (!pedido) return;
    const { sobrevivente, absorvida } = pedido;
    setPedido(null);
    iniciar(async () => {
      const r = await mesclarItemRevisao(item.id, sobrevivente.id, absorvida.id);
      setEstado(r);
      aoConcluir(r);
    });
  }

  function descartar() {
    if (!window.confirm("Descartar este item? As duas pessoas continuam separadas.")) return;
    iniciar(async () => {
      const r = await descartarItemRevisao(item.id);
      setEstado(r);
      aoConcluir(r);
    });
  }

  return (
    <li className="grid gap-3 rounded-lg border p-4">
      <div className="grid gap-1">
        <p className="text-muted-foreground text-xs">{`Aberto em ${item.criadoEm}`}</p>
        {item.motivo ? <p className="text-sm whitespace-normal">{item.motivo}</p> : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <CartaoPessoa rotulo="Pessoa A" pessoa={a} />
        <CartaoPessoa rotulo="Pessoa B" pessoa={b} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pendente || !a || !b}
          onClick={() => a && b && setPedido({ sobrevivente: a, absorvida: b })}
        >
          Mesclar B em A
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pendente || !a || !b}
          onClick={() => a && b && setPedido({ sobrevivente: b, absorvida: a })}
        >
          Mesclar A em B
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={descartar}>
          Descartar
        </Button>
        <MensagemAcao estado={estado} />
        {estado.ok && estado.link ? (
          <Link href={estado.link} className="text-sm underline underline-offset-4">
            Abrir a pessoa que ficou
          </Link>
        ) : null}
      </div>

      <Dialog open={Boolean(pedido)} onOpenChange={(abrir) => (abrir ? null : setPedido(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar mescla</DialogTitle>
            <DialogDescription>
              {pedido
                ? `${nomeDe(pedido.absorvida)} será absorvida por ${nomeDe(pedido.sobrevivente)}. Identificadores, eventos e mensagens passam para quem fica; nada é apagado e a linha do tempo registra a mescla. Não há como desfazer pela tela.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPedido(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={mesclar}>
              Mesclar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
