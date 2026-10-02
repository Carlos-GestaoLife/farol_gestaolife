import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dispositivos } from "@/db/schema";

// Tokens dos dispositivos (computadores com o piolho). O token é mostrado uma única vez na
// tela de Dispositivos; no banco fica só o sha256 dele (`token_hash`).

export type Dispositivo = typeof dispositivos.$inferSelect;

export const PREFIXO_TOKEN = "pio_";

/** Token novo: "pio_" + 32 bytes aleatórios em base64url (43 caracteres). */
export function gerarTokenDispositivo(): string {
  return PREFIXO_TOKEN + randomBytes(32).toString("base64url");
}

/** SHA-256 (hex) do token. É o que fica gravado em `dispositivos.token_hash`. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Extrai o token de um header `Authorization: Bearer <token>`. Sem o formato, null. */
export function extrairBearer(cabecalho: string | null): string | null {
  if (!cabecalho) return null;
  const casamento = /^Bearer\s+(\S+)\s*$/i.exec(cabecalho.trim());
  return casamento ? casamento[1] : null;
}

const FORMATO_TOKEN = /^pio_[A-Za-z0-9_-]{20,200}$/;

/**
 * Autentica a requisição pelo token do dispositivo (`Authorization: Bearer <token>`).
 * Retorna o dispositivo se o token existir e o dispositivo estiver ativo; senão, null.
 * A busca é pelo hash (índice único) e a confirmação compara os hashes em tempo constante.
 */
export async function autenticarDispositivo(request: Request): Promise<Dispositivo | null> {
  const token = extrairBearer(request.headers.get("authorization"));
  if (!token || !FORMATO_TOKEN.test(token)) return null;

  const hash = hashToken(token);
  const [dispositivo] = await db
    .select()
    .from(dispositivos)
    .where(eq(dispositivos.tokenHash, hash))
    .limit(1);
  if (!dispositivo) return null;

  const esperado = Buffer.from(dispositivo.tokenHash, "hex");
  const recebido = Buffer.from(hash, "hex");
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;

  return dispositivo.ativo ? dispositivo : null;
}
