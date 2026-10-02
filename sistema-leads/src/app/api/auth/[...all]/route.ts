import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Todas as rotas do Better Auth (/api/auth/sign-in/email, /api/auth/sign-out, /api/auth/get-session...).
export const { GET, POST } = toNextJsHandler(auth);
