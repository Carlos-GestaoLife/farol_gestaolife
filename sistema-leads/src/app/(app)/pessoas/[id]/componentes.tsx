"use client";

import { useActionState, useState, useTransition } from "react";
import { DialogoMotivoPerda } from "@/components/app/dialogo-motivo-perda";
import { MensagemAcao } from "@/components/app/mensagem-acao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ESTADO_INICIAL, type EstadoAcao } from "@/lib/acoes";
import {
  adicionarNota,
  alterarNome,
  alterarOptOut,
  alterarResponsavel,
  moverEstagio,
} from "../acoes";

type Opcao = { id: string; nome: string };
type OpcaoEstagio = Opcao & { tipo: "aberto" | "ganho" | "perdido" };

export function FormularioNome({ pessoaId, nome }: { pessoaId: string; nome: string | null }) {
  const [estado, acao, pendente] = useActionState(alterarNome, ESTADO_INICIAL);
  return (
    <form action={acao} className="grid gap-1">
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <Label htmlFor="pessoa-nome">Nome</Label>
      <div className="flex items-center gap-2">
        <Input
          id="pessoa-nome"
          name="nome"
          defaultValue={nome ?? ""}
          maxLength={120}
          placeholder="Sem nome"
          className="max-w-sm"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          Salvar nome
        </Button>
      </div>
      <MensagemAcao estado={estado} className="text-xs" />
    </form>
  );
}

/** Select de estágio: muda na hora (Perdido pede o motivo antes). */
export function SeletorEstagio({
  pessoaId,
  nomePessoa,
  estagioId,
  estagios,
}: {
  pessoaId: string;
  nomePessoa: string;
  estagioId: string | null;
  estagios: OpcaoEstagio[];
}) {
  const [valor, setValor] = useState(estagioId ?? "");
  const [aguardandoMotivo, setAguardandoMotivo] = useState<OpcaoEstagio | null>(null);
  const [estado, setEstado] = useState<EstadoAcao>(ESTADO_INICIAL);
  const [pendente, iniciar] = useTransition();

  function mover(destino: OpcaoEstagio, motivo?: string) {
    setValor(destino.id);
    iniciar(async () => {
      const r = await moverEstagio(pessoaId, destino.id, motivo);
      setEstado(r);
      if (!r.ok) setValor(estagioId ?? "");
    });
  }

  return (
    <div className="grid gap-1">
      <Label htmlFor="pessoa-estagio">Estágio</Label>
      <NativeSelect
        id="pessoa-estagio"
        value={valor}
        disabled={pendente}
        className="w-60"
        onChange={(e) => {
          const destino = estagios.find((x) => x.id === e.target.value);
          if (!destino || destino.id === valor) return;
          if (destino.tipo === "perdido") setAguardandoMotivo(destino);
          else mover(destino);
        }}
      >
        {estagioId ? null : <NativeSelectOption value="">Sem estágio</NativeSelectOption>}
        {estagios.map((e) => (
          <NativeSelectOption key={e.id} value={e.id}>
            {e.nome}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <MensagemAcao estado={estado} className="text-xs" />
      <DialogoMotivoPerda
        aberto={Boolean(aguardandoMotivo)}
        nomePessoa={nomePessoa}
        nomeEstagio={aguardandoMotivo?.nome ?? "Perdido"}
        onCancelar={() => setAguardandoMotivo(null)}
        onConfirmar={(motivo) => {
          if (aguardandoMotivo) mover(aguardandoMotivo, motivo);
          setAguardandoMotivo(null);
        }}
      />
    </div>
  );
}

export function SeletorResponsavel({
  pessoaId,
  responsavelId,
  usuarios,
}: {
  pessoaId: string;
  responsavelId: string | null;
  usuarios: Opcao[];
}) {
  const [valor, setValor] = useState(responsavelId ?? "");
  const [estado, setEstado] = useState<EstadoAcao>(ESTADO_INICIAL);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="grid gap-1">
      <Label htmlFor="pessoa-responsavel">Responsável</Label>
      <NativeSelect
        id="pessoa-responsavel"
        value={valor}
        disabled={pendente}
        className="w-60"
        onChange={(e) => {
          const novo = e.target.value;
          setValor(novo);
          iniciar(async () => {
            const r = await alterarResponsavel(pessoaId, novo || null);
            setEstado(r);
            if (!r.ok) setValor(responsavelId ?? "");
          });
        }}
      >
        <NativeSelectOption value="">Sem responsável</NativeSelectOption>
        {usuarios.map((u) => (
          <NativeSelectOption key={u.id} value={u.id}>
            {u.nome}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <MensagemAcao estado={estado} className="text-xs" />
    </div>
  );
}

export function BotaoOptOut({ pessoaId, optOut }: { pessoaId: string; optOut: boolean }) {
  const [estado, setEstado] = useState<EstadoAcao>(ESTADO_INICIAL);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="grid gap-1">
      <span className="text-sm leading-none font-medium">Opt-out</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          role="switch"
          aria-checked={optOut}
          aria-label="Opt-out"
          variant={optOut ? "destructive" : "outline"}
          size="sm"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setEstado(await alterarOptOut(pessoaId, !optOut));
            })
          }
        >
          {optOut ? "Ativado" : "Desativado"}
        </Button>
        <span className="text-muted-foreground text-xs">
          {optOut ? "A pessoa pediu para não receber contato." : "Pode receber contato."}
        </span>
      </div>
      <MensagemAcao estado={estado} className="text-xs" />
    </div>
  );
}

export function FormularioNota({ pessoaId }: { pessoaId: string }) {
  const [estado, acao, pendente] = useActionState(adicionarNota, ESTADO_INICIAL);
  return (
    // O React limpa o formulário depois da action; em erro, o texto volta pelo defaultValue.
    <form action={acao} className="grid gap-2">
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <Label htmlFor="nota-texto">Nova nota</Label>
      <Textarea
        id="nota-texto"
        name="texto"
        required
        maxLength={2000}
        defaultValue={estado.ok ? "" : estado.valores?.texto}
        placeholder="Ex.: pediu retorno na segunda à tarde"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando..." : "Adicionar nota"}
        </Button>
        <MensagemAcao estado={estado} />
      </div>
    </form>
  );
}
