"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function FormularioLogin({ destino }: { destino: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    setErro(null);
    setEnviando(true);

    const { error } = await authClient.signIn.email({
      email: String(dados.get("email") ?? "").trim().toLowerCase(),
      password: String(dados.get("senha") ?? ""),
    });

    if (error) {
      setEnviando(false);
      // 401 = credenciais erradas; 400 = formato inválido (ex.: e-mail malformado).
      if (error.status === 401 || error.status === 400) {
        setErro("E-mail ou senha inválidos");
      } else if (error.status === 429) {
        setErro("Muitas tentativas. Aguarde um pouco e tente de novo.");
      } else {
        setErro("Não foi possível entrar agora. Tente de novo em instantes.");
      }
      return;
    }

    router.replace(destino);
    router.refresh();
  }

  return (
    <form onSubmit={entrar} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          disabled={enviando}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          disabled={enviando}
        />
      </div>
      {erro ? (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
