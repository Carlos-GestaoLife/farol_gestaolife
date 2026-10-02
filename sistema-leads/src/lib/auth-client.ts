import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

// Cliente do Better Auth para componentes do navegador. Mesma origem do sistema, então não
// precisa de baseURL. O tipo do usuário inclui `papel` (só leitura: o servidor ignora o campo
// se o cliente tentar enviá-lo).
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});
