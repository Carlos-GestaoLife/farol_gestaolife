"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useActionState, useState } from "react";
import { MensagemAcao } from "@/components/app/mensagem-acao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { TableCell, TableRow } from "@/components/ui/table";
import { ESTADO_INICIAL } from "@/lib/acoes";
import { alternarAtivo, criarDispositivo, gerarNovoToken } from "./acoes";

export type OpcaoUsuario = { id: string; nome: string };

/** Mostra o token recém-gerado. Ele só existe nesta resposta: depois não é mostrado de novo. */
function CaixaToken({ token }: { token: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(token);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 whitespace-normal">
      <p className="flex items-center gap-2 text-sm font-medium">
        <TriangleAlert className="size-4 text-amber-600" aria-hidden="true" />
        Copie agora: este token não será mostrado de novo.
      </p>
      <p className="text-muted-foreground text-xs">
        Cole o token nas configurações do piolho neste computador. Se perder, gere um novo token.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="bg-muted rounded px-2 py-1 font-mono text-xs break-all select-all">
          {token}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copiar}>
          {copiado ? <Check /> : <Copy />}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}

export function FormularioNovoDispositivo({ usuarios }: { usuarios: OpcaoUsuario[] }) {
  const [estado, acao, pendente] = useActionState(criarDispositivo, ESTADO_INICIAL);
  const v = estado.valores;
  return (
    <div className="grid gap-4">
      <form action={acao} className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="dispositivo-nome">Nome</Label>
          <Input
            id="dispositivo-nome"
            name="nome"
            required
            maxLength={80}
            placeholder="Ex.: PC Comercial 1"
            defaultValue={v?.nome}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="dispositivo-usuario">Usuário (opcional)</Label>
          <NativeSelect
            id="dispositivo-usuario"
            name="usuarioId"
            defaultValue={v?.usuarioId ?? ""}
            className="w-full"
          >
            <NativeSelectOption value="">Nenhum</NativeSelectOption>
            {usuarios.map((u) => (
              <NativeSelectOption key={u.id} value={u.id}>
                {u.nome}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pendente}>
            {pendente ? "Gerando..." : "Criar dispositivo e gerar token"}
          </Button>
          <MensagemAcao estado={estado} />
        </div>
      </form>
      {estado.ok && estado.token ? <CaixaToken token={estado.token} /> : null}
    </div>
  );
}

export type LinhaDispositivoDados = {
  id: string;
  nome: string;
  usuario: string | null;
  numeroDetectado: string | null;
  ultimoSinal: string;
  ultimoSync: string;
  filaPendente: number;
  versaoExtensao: string | null;
  ativo: boolean;
};

const COLUNAS = 9;

export function LinhaDispositivo({ dispositivo: d }: { dispositivo: LinhaDispositivoDados }) {
  const [estadoAtivo, acaoAtivo, pendenteAtivo] = useActionState(alternarAtivo, ESTADO_INICIAL);
  const [estadoToken, acaoToken, pendenteToken] = useActionState(gerarNovoToken, ESTADO_INICIAL);

  function confirmarNovoToken(evento: React.FormEvent<HTMLFormElement>) {
    const ok = window.confirm(
      `Gerar um novo token para "${d.nome}"? O token atual deixa de funcionar na hora e o piolho desse computador precisa receber o novo.`,
    );
    if (!ok) evento.preventDefault();
  }

  return (
    <>
      <TableRow className={d.ativo ? undefined : "text-muted-foreground"}>
        <TableCell className="font-medium">{d.nome}</TableCell>
        <TableCell>{d.usuario ?? "-"}</TableCell>
        <TableCell className="tabular-nums">{d.numeroDetectado ?? "-"}</TableCell>
        <TableCell>{d.ultimoSinal}</TableCell>
        <TableCell>{d.ultimoSync}</TableCell>
        <TableCell className="text-right tabular-nums">{d.filaPendente}</TableCell>
        <TableCell>{d.versaoExtensao ?? "-"}</TableCell>
        <TableCell>
          <Badge variant={d.ativo ? "secondary" : "outline"}>{d.ativo ? "Ativo" : "Inativo"}</Badge>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <form action={acaoAtivo}>
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="ativo" value={d.ativo ? "false" : "true"} />
              <Button type="submit" variant="outline" size="sm" disabled={pendenteAtivo}>
                {d.ativo ? "Desativar" : "Reativar"}
              </Button>
            </form>
            <form action={acaoToken} onSubmit={confirmarNovoToken}>
              <input type="hidden" name="id" value={d.id} />
              <Button type="submit" variant="outline" size="sm" disabled={pendenteToken}>
                Gerar novo token
              </Button>
            </form>
          </div>
          <MensagemAcao
            estado={estadoAtivo.ok ? ESTADO_INICIAL : estadoAtivo}
            className="text-xs"
          />
          <MensagemAcao
            estado={estadoToken.ok ? ESTADO_INICIAL : estadoToken}
            className="text-xs"
          />
        </TableCell>
      </TableRow>
      {estadoToken.ok && estadoToken.token ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={COLUNAS}>
            <CaixaToken token={estadoToken.token} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
