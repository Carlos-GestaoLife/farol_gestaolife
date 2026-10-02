"use client";

import { useActionState } from "react";
import { MensagemAcao } from "@/components/app/mensagem-acao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { TableCell, TableRow } from "@/components/ui/table";
import { ESTADO_INICIAL } from "@/lib/acoes";
import { PAPEIS, ROTULO_PAPEL, type Papel } from "@/lib/papeis";
import { adicionarNumero, alterarPapel, criarUsuario, editarNumero, redefinirSenha } from "./acoes";

export type OpcaoUsuario = { id: string; nome: string };

export const ROTULO_PAPEL_NUMERO = {
  central: "Central",
  sdr: "SDR",
  vendedor: "Vendedor",
} as const;
type PapelNumero = keyof typeof ROTULO_PAPEL_NUMERO;

export function FormularioNovoUsuario() {
  const [estado, acao, pendente] = useActionState(criarUsuario, ESTADO_INICIAL);
  const v = estado.valores;
  return (
    <form action={acao} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="novo-nome">Nome</Label>
        <Input id="novo-nome" name="nome" required maxLength={120} defaultValue={v?.nome} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="novo-email">E-mail</Label>
        <Input id="novo-email" name="email" type="email" required defaultValue={v?.email} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="novo-papel">Papel</Label>
        <NativeSelect
          id="novo-papel"
          name="papel"
          defaultValue={v?.papel || "comercial"}
          className="w-full"
        >
          {PAPEIS.map((p) => (
            <NativeSelectOption key={p} value={p}>
              {ROTULO_PAPEL[p]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="novo-senha">Senha inicial</Label>
        <Input
          id="novo-senha"
          name="senha"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Pelo menos 8 caracteres"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Criando..." : "Criar usuário"}
        </Button>
        <MensagemAcao estado={estado} />
      </div>
    </form>
  );
}

function FormularioPapel({ usuarioId, papel }: { usuarioId: string; papel: Papel }) {
  const [estado, acao, pendente] = useActionState(alterarPapel, ESTADO_INICIAL);
  return (
    <form action={acao} className="grid gap-1">
      <input type="hidden" name="usuarioId" value={usuarioId} />
      <div className="flex items-center gap-2">
        <NativeSelect name="papel" defaultValue={papel} aria-label="Papel" className="w-36">
          {PAPEIS.map((p) => (
            <NativeSelectOption key={p} value={p}>
              {ROTULO_PAPEL[p]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          Alterar
        </Button>
      </div>
      <MensagemAcao estado={estado} className="max-w-56 text-xs" />
    </form>
  );
}

function FormularioSenha({ usuarioId }: { usuarioId: string }) {
  const [estado, acao, pendente] = useActionState(redefinirSenha, ESTADO_INICIAL);
  return (
    <form action={acao} className="grid gap-1">
      <input type="hidden" name="usuarioId" value={usuarioId} />
      <div className="flex items-center gap-2">
        <Input
          name="senha"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Nova senha"
          aria-label="Nova senha"
          className="w-40"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          Redefinir
        </Button>
      </div>
      <MensagemAcao estado={estado} className="max-w-56 text-xs" />
    </form>
  );
}

export function LinhaUsuario({
  usuario,
  ehVoce,
}: {
  usuario: { id: string; nome: string; email: string; papel: Papel; criadoEm: string };
  ehVoce: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        {usuario.nome}
        {ehVoce ? <span className="text-muted-foreground ml-1 font-normal">(você)</span> : null}
      </TableCell>
      <TableCell>{usuario.email}</TableCell>
      <TableCell>
        {ehVoce ? (
          <div className="grid gap-1">
            <Badge variant="secondary">{ROTULO_PAPEL[usuario.papel]}</Badge>
            <span className="text-muted-foreground text-xs">
              O próprio papel não pode ser alterado
            </span>
          </div>
        ) : (
          <FormularioPapel usuarioId={usuario.id} papel={usuario.papel} />
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{usuario.criadoEm}</TableCell>
      <TableCell>
        <FormularioSenha usuarioId={usuario.id} />
      </TableCell>
    </TableRow>
  );
}

function OpcoesPapelNumero() {
  return (
    <>
      <NativeSelectOption value="">Sem papel</NativeSelectOption>
      {(Object.keys(ROTULO_PAPEL_NUMERO) as PapelNumero[]).map((p) => (
        <NativeSelectOption key={p} value={p}>
          {ROTULO_PAPEL_NUMERO[p]}
        </NativeSelectOption>
      ))}
    </>
  );
}

function OpcoesUsuario({ usuarios }: { usuarios: OpcaoUsuario[] }) {
  return (
    <>
      <NativeSelectOption value="">Nenhum</NativeSelectOption>
      {usuarios.map((u) => (
        <NativeSelectOption key={u.id} value={u.id}>
          {u.nome}
        </NativeSelectOption>
      ))}
    </>
  );
}

export function LinhaNumero({
  numero,
  usuarios,
}: {
  numero: {
    numero: string;
    formatado: string;
    apelido: string | null;
    papel: PapelNumero | null;
    usuarioId: string | null;
  };
  usuarios: OpcaoUsuario[];
}) {
  const [estado, acao, pendente] = useActionState(editarNumero, ESTADO_INICIAL);
  // Os campos ficam em células diferentes e apontam para o mesmo formulário (atributo form).
  const idForm = `numero-${numero.numero}`;
  return (
    <TableRow>
      <TableCell className="font-medium tabular-nums">
        <form id={idForm} action={acao}>
          <input type="hidden" name="numero" value={numero.numero} />
        </form>
        {numero.formatado}
      </TableCell>
      <TableCell>
        <Input
          form={idForm}
          name="apelido"
          defaultValue={numero.apelido ?? ""}
          maxLength={80}
          placeholder="Ex.: Central Goiânia"
          aria-label="Apelido"
          className="w-48"
        />
      </TableCell>
      <TableCell>
        <NativeSelect
          form={idForm}
          name="papel"
          defaultValue={numero.papel ?? ""}
          aria-label="Papel do número"
          className="w-36"
        >
          <OpcoesPapelNumero />
        </NativeSelect>
      </TableCell>
      <TableCell>
        <NativeSelect
          form={idForm}
          name="usuarioId"
          defaultValue={numero.usuarioId ?? ""}
          aria-label="Usuário vinculado"
          className="w-44"
        >
          <OpcoesUsuario usuarios={usuarios} />
        </NativeSelect>
      </TableCell>
      <TableCell>
        <div className="grid gap-1">
          <Button type="submit" form={idForm} variant="outline" size="sm" disabled={pendente}>
            Salvar
          </Button>
          <MensagemAcao estado={estado} className="max-w-40 text-xs" />
        </div>
      </TableCell>
    </TableRow>
  );
}

export function FormularioNovoNumero({ usuarios }: { usuarios: OpcaoUsuario[] }) {
  const [estado, acao, pendente] = useActionState(adicionarNumero, ESTADO_INICIAL);
  const v = estado.valores;
  return (
    <form action={acao} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="numero-telefone">Telefone</Label>
        <Input
          id="numero-telefone"
          name="telefone"
          required
          inputMode="tel"
          placeholder="Ex.: 62 99999-8888"
          defaultValue={v?.telefone}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="numero-apelido">Apelido</Label>
        <Input id="numero-apelido" name="apelido" maxLength={80} defaultValue={v?.apelido} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="numero-papel">Papel do número</Label>
        <NativeSelect
          id="numero-papel"
          name="papel"
          defaultValue={v?.papel ?? ""}
          className="w-full"
        >
          <OpcoesPapelNumero />
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="numero-usuario">Usuário vinculado</Label>
        <NativeSelect
          id="numero-usuario"
          name="usuarioId"
          defaultValue={v?.usuarioId ?? ""}
          className="w-full"
        >
          <OpcoesUsuario usuarios={usuarios} />
        </NativeSelect>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Adicionando..." : "Adicionar número"}
        </Button>
        <MensagemAcao estado={estado} />
      </div>
    </form>
  );
}
