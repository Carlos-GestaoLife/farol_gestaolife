"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MAX_MOTIVO = 500;

/**
 * Diálogo que pede o motivo da perda antes de mover para um estágio do tipo perdido.
 * Só confirma com o motivo preenchido.
 */
export function DialogoMotivoPerda({
  aberto,
  nomePessoa,
  nomeEstagio,
  onCancelar,
  onConfirmar,
}: {
  aberto: boolean;
  nomePessoa?: string;
  nomeEstagio: string;
  onCancelar: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const valido = motivo.trim().length > 0;

  function fechar() {
    setMotivo("");
    onCancelar();
  }

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => (abrir ? null : fechar())}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valido) return;
            onConfirmar(motivo.trim());
            setMotivo("");
          }}
        >
          <DialogHeader>
            <DialogTitle>{`Mover para ${nomeEstagio}`}</DialogTitle>
            <DialogDescription>
              {nomePessoa
                ? `Informe o motivo da perda de ${nomePessoa}. Ele fica gravado na pessoa e na linha do tempo.`
                : "Informe o motivo da perda. Ele fica gravado na pessoa e na linha do tempo."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="motivo-perda">Motivo da perda</Label>
            <Textarea
              id="motivo-perda"
              name="motivoPerda"
              value={motivo}
              maxLength={MAX_MOTIVO}
              required
              autoFocus
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: achou caro, comprou de outro, não respondeu mais"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valido}>
              Confirmar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
