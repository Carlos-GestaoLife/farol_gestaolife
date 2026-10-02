"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { MensagemAcao } from "@/components/app/mensagem-acao";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ESTADO_INICIAL } from "@/lib/acoes";
import { criarLead } from "./acoes";

function FormularioNovoLead() {
  const [estado, acao, pendente] = useActionState(criarLead, ESTADO_INICIAL);
  const v = estado.ok ? undefined : estado.valores;
  return (
    // O React limpa o formulário depois da action; em erro, os valores voltam pelo defaultValue.
    <form action={acao} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="lead-nome">Nome</Label>
        <Input id="lead-nome" name="nome" maxLength={120} defaultValue={v?.nome} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="lead-telefone">Telefone</Label>
        <Input
          id="lead-telefone"
          name="telefone"
          inputMode="tel"
          placeholder="Ex.: 62 99999-8888"
          defaultValue={v?.telefone}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="lead-email">E-mail</Label>
        <Input id="lead-email" name="email" type="email" defaultValue={v?.email} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="lead-nota">Nota (opcional)</Label>
        <Textarea id="lead-nota" name="nota" maxLength={2000} defaultValue={v?.nota} />
      </div>
      <p className="text-muted-foreground text-xs">Informe pelo menos o telefone ou o e-mail.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar lead"}
        </Button>
        <MensagemAcao estado={estado} />
        {estado.ok && estado.link ? (
          <Link href={estado.link} className="text-sm underline underline-offset-4">
            Abrir a ficha
          </Link>
        ) : null}
      </div>
    </form>
  );
}

/** Botão "Novo lead" com o formulário num diálogo. */
export function BotaoNovoLead() {
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Novo lead
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo lead</DialogTitle>
          <DialogDescription>
            O lead entra pelo mesmo caminho das outras fontes e cai no estágio Novo lead.
          </DialogDescription>
        </DialogHeader>
        {/* Remonta a cada abertura: começa sempre limpo. */}
        {aberto ? <FormularioNovoLead /> : null}
      </DialogContent>
    </Dialog>
  );
}
