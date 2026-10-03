import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AuthTokenType } from "@prisma/client";

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Only this hash is stored, so a database leak doesn't hand out working links. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function hmac(value: string, secret = process.env.NEXTAUTH_SECRET || ""): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const TTL_MS: Record<AuthTokenType, number> = {
  VERIFY_EMAIL: 48 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000
};

/** Issues a fresh single-use token, replacing any unused ones of the same type. */
export async function issueAuthToken(userId: string, type: AuthTokenType): Promise<string> {
  const token = randomToken();
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, type, usedAt: null } }),
    prisma.authToken.create({ data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TTL_MS[type]) } })
  ]);
  return token;
}

/** Marks the token used and returns its account id, or null if it is unknown, expired or already used. */
export async function consumeAuthToken(token: string, type: AuthTokenType): Promise<string | null> {
  if (!token) return null;
  const claimed = await prisma.authToken.updateMany({
    where: { tokenHash: hashToken(token), type, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() }
  });
  if (claimed.count === 0) return null;
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) }, select: { userId: true } });
  return row?.userId ?? null;
}
