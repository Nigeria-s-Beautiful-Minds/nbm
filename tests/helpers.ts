// Shared helpers for the checks in this folder. They run against the local development server
// (npm run dev) and its database, and remove every record they create.
import bcrypt from "bcryptjs";
import { PrismaClient, type Role } from "@prisma/client";
import type { Viewer } from "../lib/viewer";

export const prisma = new PrismaClient();
export const BASE = (process.env.NEXTAUTH_URL || "http://localhost:4174").replace(/\/$/, "");
export const RUN = `t${Date.now().toString(36)}`;
const PASSWORD = "test-password-123";

export type TestUser = { id: string; email: string; name: string; cookie: string; viewer: Viewer };

/** Creates a confirmed account directly, then signs in over HTTP exactly as a browser would. */
export async function makeUser(label: string, roles: Role[] = []): Promise<TestUser> {
  const email = `${RUN}-${label}@test.nbm.local`;
  const name = `Test ${label}`;
  const user = await prisma.user.create({ data: { email, name, passwordHash: await bcrypt.hash(PASSWORD, 4), emailVerified: new Date(), roles: ["MEMBER", ...roles] } });
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const jar = csrfRes.headers.getSetCookie().map((c) => c.split(";")[0]);
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar.join("; ") },
    body: new URLSearchParams({ csrfToken, email, password: PASSWORD, json: "true" })
  });
  const cookie = [...jar, ...loginRes.headers.getSetCookie().map((c) => c.split(";")[0])].join("; ");
  if (!cookie.includes("session-token")) throw new Error(`Sign-in failed for ${label}`);
  return { id: user.id, email, name, cookie, viewer: { id: user.id, name, email, roles: ["MEMBER", ...roles], emailVerified: true, initials: "TT", isStaff: roles.length > 0 } };
}

export function api(user: TestUser | null, path: string, init: { method?: string; json?: unknown; body?: BodyInit; headers?: Record<string, string> } = {}) {
  return fetch(`${BASE}${path}`, {
    method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
    redirect: "manual",
    headers: { ...(user ? { Cookie: user.cookie } : {}), ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}), ...init.headers },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body
  });
}

// A real 1x1 PNG, so the server's signature check has genuine bytes to read.
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

/** Runs the real three-step upload: request a target, PUT the bytes, ask the server to verify them. */
export async function uploadFile(user: TestUser, purpose: string, mime: string, bytes: Buffer): Promise<{ uploadId?: string; status: number; error?: string }> {
  const sign = await api(user, "/api/uploads", { json: { purpose, mime, size: bytes.length } });
  const signed = await sign.json();
  if (!sign.ok) return { status: sign.status, error: signed.error };
  const put = await fetch(signed.url.startsWith("http") ? signed.url : `${BASE}${signed.url}`, { method: "PUT", headers: signed.headers, body: new Uint8Array(bytes) });
  if (!put.ok) return { status: put.status, error: "put failed" };
  const done = await api(user, `/api/uploads/${signed.uploadId}/complete`, { method: "POST" });
  const result = await done.json();
  return done.ok ? { uploadId: signed.uploadId, status: 200 } : { status: done.status, error: result.error };
}

export async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: RUN } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.paymentEvent.deleteMany({ where: { OR: [{ contribution: { donorEmail: { startsWith: RUN } } }, { eventId: { contains: RUN } }] } });
  await prisma.contribution.deleteMany({ where: { donorEmail: { startsWith: RUN } } });
  await prisma.disbursement.deleteMany({ where: { campaign: { requesterId: { in: ids } } } });
  await prisma.emailOutbox.deleteMany({ where: { toEmail: { startsWith: RUN } } });
  await prisma.mailingSubscriber.deleteMany({ where: { email: { startsWith: RUN } } });
  await prisma.contactRequest.deleteMany({ where: { email: { startsWith: RUN } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}
