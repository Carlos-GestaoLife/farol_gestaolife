"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function BotaoSair({ className }: { className?: string }) {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={sair}
      disabled={saindo}
      className={cn("justify-start", className)}
    >
      <LogOut />
      {saindo ? "Saindo..." : "Sair"}
    </Button>
  );
}
