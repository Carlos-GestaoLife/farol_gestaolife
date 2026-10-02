import type { EstadoAcao } from "@/lib/acoes";
import { cn } from "@/lib/utils";

/** Mensagem de retorno de uma Server Action (sucesso em tom neutro, erro em vermelho). */
export function MensagemAcao({ estado, className }: { estado: EstadoAcao; className?: string }) {
  if (!estado.mensagem) return null;
  return (
    <p
      role={estado.ok ? "status" : "alert"}
      className={cn(
        "text-sm whitespace-normal",
        estado.ok ? "text-muted-foreground" : "text-destructive",
        className,
      )}
    >
      {estado.mensagem}
    </p>
  );
}
