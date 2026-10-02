"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Clock, Phone, Signpost, UserRound } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { DialogoMotivoPerda } from "@/components/app/dialogo-motivo-perda";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { moverEstagio } from "../pessoas/acoes";

export type CartaoQuadro = {
  id: string;
  titulo: string;
  telefone: string | null;
  origem: string;
  responsavel: string | null;
  /** "há 2 h" quando a pessoa espera resposta; null quando não espera. */
  semResposta: string | null;
};

export type ColunaQuadro = {
  id: string;
  nome: string;
  tipo: "aberto" | "ganho" | "perdido";
  total: number;
  limite: number;
  cartoes: CartaoQuadro[];
};

type Movimento = { cartao: CartaoQuadro; de: string; para: string };

/** Tira o cartão da coluna de origem e põe no topo da de destino (atualização otimista). */
function aplicarMovimento(colunas: ColunaQuadro[], m: Movimento): ColunaQuadro[] {
  return colunas.map((c) => {
    if (c.id === m.de) {
      return { ...c, total: Math.max(0, c.total - 1), cartoes: c.cartoes.filter((x) => x.id !== m.cartao.id) };
    }
    if (c.id === m.para) return { ...c, total: c.total + 1, cartoes: [m.cartao, ...c.cartoes] };
    return c;
  });
}

function ConteudoCartao({ cartao }: { cartao: CartaoQuadro }) {
  return (
    <div className="grid gap-1.5">
      <Link
        href={`/pessoas/${cartao.id}`}
        className="truncate text-sm font-medium underline-offset-4 hover:underline"
        // Clique abre a ficha; arrastar começa só depois de mover alguns pixels.
        onPointerDown={(e) => e.stopPropagation()}
      >
        {cartao.titulo}
      </Link>
      {cartao.telefone ? (
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
          <Phone className="size-3" aria-hidden />
          {cartao.telefone}
        </span>
      ) : null}
      <span className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
        <Signpost className="size-3 shrink-0" aria-hidden />
        {cartao.origem}
      </span>
      <span className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
        <UserRound className="size-3 shrink-0" aria-hidden />
        {cartao.responsavel ?? "Sem responsável"}
      </span>
      {cartao.semResposta ? (
        <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
          <Clock aria-hidden />
          {`Sem resposta ${cartao.semResposta}`}
        </Badge>
      ) : null}
    </div>
  );
}

function Cartao({ cartao, colunaId }: { cartao: CartaoQuadro; colunaId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: cartao.id,
    data: { cartao, colunaId },
  });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-cartao={cartao.id}
      aria-roledescription="Cartão arrastável"
      className={cn(
        "bg-card cursor-grab touch-none rounded-md border p-3 shadow-xs select-none active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <ConteudoCartao cartao={cartao} />
    </li>
  );
}

function Coluna({
  coluna,
  recolhida,
  alternar,
}: {
  coluna: ColunaQuadro;
  recolhida: boolean;
  alternar: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id, data: { coluna } });
  const final = coluna.tipo !== "aberto";

  if (recolhida) {
    return (
      <section
        ref={setNodeRef}
        data-coluna={coluna.nome}
        aria-label={`${coluna.nome}: ${coluna.total}`}
        className={cn(
          "bg-muted/40 flex w-14 shrink-0 flex-col items-center gap-3 rounded-lg border py-3",
          isOver && "ring-ring ring-2",
        )}
      >
        <Button variant="ghost" size="icon" onClick={alternar} aria-label={`Expandir ${coluna.nome}`}>
          <ChevronRight />
        </Button>
        <Badge variant="secondary">{coluna.total}</Badge>
        <span className="text-sm font-medium [writing-mode:vertical-rl]">{coluna.nome}</span>
      </section>
    );
  }

  return (
    <section
      ref={setNodeRef}
      data-coluna={coluna.nome}
      aria-label={coluna.nome}
      className={cn(
        "bg-muted/40 flex max-h-[calc(100dvh-14rem)] w-72 shrink-0 flex-col rounded-lg border",
        isOver && "ring-ring ring-2",
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold">{coluna.nome}</h2>
          <Badge variant="secondary" data-total>
            {coluna.total}
          </Badge>
        </div>
        {final ? (
          <Button variant="ghost" size="icon" onClick={alternar} aria-label={`Recolher ${coluna.nome}`}>
            <ChevronLeft />
          </Button>
        ) : null}
      </header>
      <ul className="grid min-h-24 flex-1 content-start gap-2 overflow-y-auto p-2">
        {coluna.cartoes.map((c) => (
          <Cartao key={c.id} cartao={c} colunaId={coluna.id} />
        ))}
        {coluna.cartoes.length === 0 ? (
          <li className="text-muted-foreground px-1 py-4 text-center text-xs">Nenhum lead</li>
        ) : null}
      </ul>
      {coluna.total > coluna.cartoes.length ? (
        <p className="text-muted-foreground border-t px-3 py-2 text-xs">
          {`Mostrando os ${coluna.cartoes.length} mais recentes de ${coluna.total}. Use a busca ou a tela Leads para ver os demais.`}
        </p>
      ) : null}
    </section>
  );
}

export function Quadro({ colunas: doServidor }: { colunas: ColunaQuadro[] }) {
  // Estado local para a atualização otimista; volta a seguir o servidor a cada nova renderização.
  const [base, setBase] = useState(doServidor);
  const [colunas, setColunas] = useState(doServidor);
  if (doServidor !== base) {
    setBase(doServidor);
    setColunas(doServidor);
  }

  const [expandidas, setExpandidas] = useState<Set<string>>(() => new Set());
  const [arrastando, setArrastando] = useState<CartaoQuadro | null>(null);
  const [aguardandoMotivo, setAguardandoMotivo] = useState<Movimento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciarTransicao] = useTransition();

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function confirmarMovimento(m: Movimento, motivoPerda?: string) {
    const anterior = colunas;
    setErro(null);
    setColunas(aplicarMovimento(colunas, m));
    iniciarTransicao(async () => {
      try {
        const r = await moverEstagio(m.cartao.id, m.para, motivoPerda);
        if (!r.ok) {
          setColunas(anterior);
          setErro(r.mensagem ?? "Não foi possível mover o lead.");
        }
      } catch {
        setColunas(anterior);
        setErro("Não foi possível mover o lead. Verifique a conexão e tente de novo.");
      }
    });
  }

  function aoComecar(e: DragStartEvent) {
    setArrastando((e.active.data.current?.cartao as CartaoQuadro | undefined) ?? null);
  }

  function aoSoltar(e: DragEndEvent) {
    setArrastando(null);
    const dados = e.active.data.current as { cartao: CartaoQuadro; colunaId: string } | undefined;
    const para = e.over?.id ? String(e.over.id) : null;
    if (!dados || !para || para === dados.colunaId) return;
    const destino = colunas.find((c) => c.id === para);
    if (!destino) return;
    const movimento = { cartao: dados.cartao, de: dados.colunaId, para };
    if (destino.tipo === "perdido") setAguardandoMotivo(movimento);
    else confirmarMovimento(movimento);
  }

  const destinoMotivo = aguardandoMotivo
    ? colunas.find((c) => c.id === aguardandoMotivo.para)
    : undefined;

  return (
    <div className="grid gap-3">
      {erro ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-4 py-2 text-sm"
        >
          {erro}
        </p>
      ) : null}
      <DndContext
        id="kanban"
        sensors={sensores}
        onDragStart={aoComecar}
        onDragEnd={aoSoltar}
        onDragCancel={() => setArrastando(null)}
      >
        <div className="flex items-start gap-3 overflow-x-auto pb-3">
          {colunas.map((c) => {
            const recolhivel = c.tipo !== "aberto";
            const recolhida = recolhivel && !expandidas.has(c.id);
            return (
              <Coluna
                key={c.id}
                coluna={c}
                recolhida={recolhida}
                alternar={() =>
                  setExpandidas((atual) => {
                    const nova = new Set(atual);
                    if (nova.has(c.id)) nova.delete(c.id);
                    else nova.add(c.id);
                    return nova;
                  })
                }
              />
            );
          })}
        </div>
        <DragOverlay>
          {arrastando ? (
            <div className="bg-card w-72 cursor-grabbing rounded-md border p-3 shadow-lg">
              <ConteudoCartao cartao={arrastando} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <DialogoMotivoPerda
        aberto={Boolean(aguardandoMotivo)}
        nomePessoa={aguardandoMotivo?.cartao.titulo}
        nomeEstagio={destinoMotivo?.nome ?? "Perdido"}
        onCancelar={() => setAguardandoMotivo(null)}
        onConfirmar={(motivo) => {
          if (aguardandoMotivo) confirmarMovimento(aguardandoMotivo, motivo);
          setAguardandoMotivo(null);
        }}
      />
    </div>
  );
}
