// Durable email queue. Every message is first written to EmailOutbox (so nothing is lost if the
// provider is down), then delivered. Failed deliveries are retried with backoff by the jobs
// endpoint (app/api/jobs/route.ts); a dedupe key stops the same notice being queued twice.
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SITE_NAME } from "@/lib/constants";
import { baseUrl } from "@/lib/config";

const MAX_ATTEMPTS = 5;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const smtpTransport =
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT || 587) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      })
    : null;

export function emailConfigured(): boolean {
  return Boolean(resend || smtpTransport);
}

async function transportSend(to: string, subject: string, html: string): Promise<void> {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || `${SITE_NAME} <onboarding@resend.dev>`;
  if (resend) {
    const result = await resend.emails.send({ from, to, subject, html });
    if (result.error) throw new Error(result.error.message);
    return;
  }
  if (smtpTransport) {
    await smtpTransport.sendMail({ from, to, subject, html });
    return;
  }
  throw new Error("NOT_CONFIGURED");
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Shared email layout. `paragraphs` are plain text and are escaped here; pass user input freely. */
export function renderEmail({ heading, paragraphs, action, footnote }: { heading: string; paragraphs: string[]; action?: { label: string; url: string }; footnote?: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.6;color:#17211D;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`).join("");
  const button = action
    ? `<p style="margin:22px 0;"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:13px 24px;background:#008751;color:#ffffff;border-radius:10px;font-weight:700;text-decoration:none;">${escapeHtml(action.label)}</a></p><p style="margin:0 0 14px;font-size:13px;color:#68756E;word-break:break-all;">Or open this link: ${escapeHtml(action.url)}</p>`
    : "";
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#FAFCFA;border:1px solid #DCE3DF;border-radius:16px;">
  <p style="margin:0 0 18px;font-weight:800;color:#064E3B;letter-spacing:0.02em;">${escapeHtml(SITE_NAME)}</p>
  <h2 style="margin:0 0 14px;font-size:20px;color:#064E3B;">${escapeHtml(heading)}</h2>
  ${body}${button}
  <p style="margin:18px 0 0;font-size:12px;color:#68756E;">${escapeHtml(footnote || `Sent by ${SITE_NAME} · ${baseUrl()}`)}</p>
</div>`;
}

export type QueuedEmail = { to: string; subject: string; html: string; kind: string; dedupeKey?: string };

type Db = PrismaClient | Prisma.TransactionClient;

/** Writes the message to the queue. Returns null when the same dedupeKey was already queued. */
export async function queueEmail(db: Db, email: QueuedEmail): Promise<string | null> {
  if (email.dedupeKey) {
    const existing = await db.emailOutbox.findUnique({ where: { dedupeKey: email.dedupeKey }, select: { id: true } });
    if (existing) return null;
  }
  const row = await db.emailOutbox.create({
    data: { toEmail: email.to, subject: email.subject, html: email.html, kind: email.kind, dedupeKey: email.dedupeKey }
  });
  return row.id;
}

export type DeliveryResult = "sent" | "queued" | "failed";

/** One delivery attempt for a queued message. */
export async function deliverEmail(id: string): Promise<DeliveryResult> {
  const row = await prisma.emailOutbox.findUnique({ where: { id } });
  if (!row || row.status !== "QUEUED") return row?.status === "SENT" ? "sent" : "failed";

  if (Date.now() - row.createdAt.getTime() > STALE_AFTER_MS) {
    await prisma.emailOutbox.update({ where: { id }, data: { status: "FAILED", lastError: "Not delivered within 24 hours; abandoned." } });
    return "failed";
  }

  try {
    await transportSend(row.toEmail, row.subject, row.html);
    await prisma.emailOutbox.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null } });
    return "sent";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NOT_CONFIGURED") {
      // No provider yet: keep it queued without burning retries, and say so plainly.
      await prisma.emailOutbox.update({ where: { id }, data: { lastError: "Email delivery is not configured (set RESEND_API_KEY or SMTP_*)." } });
      if (process.env.NODE_ENV !== "production") console.log(`[email not sent: no transport] to=${row.toEmail} subject="${row.subject}" (see /admin/email)`);
      return "queued";
    }
    const attempts = row.attempts + 1;
    const giveUp = attempts >= MAX_ATTEMPTS;
    await prisma.emailOutbox.update({
      where: { id },
      data: {
        attempts,
        status: giveUp ? "FAILED" : "QUEUED",
        // Only the provider's error text is kept, never message contents or credentials.
        lastError: message.slice(0, 500),
        nextAttemptAt: new Date(Date.now() + attempts * attempts * 5 * 60 * 1000)
      }
    });
    console.error(`[email] delivery failed (attempt ${attempts}) kind=${row.kind}:`, message);
    return giveUp ? "failed" : "queued";
  }
}

/** Queue and try once straight away. The caller learns whether it actually went out. */
export async function sendEmail(email: QueuedEmail): Promise<DeliveryResult> {
  const id = await queueEmail(prisma, email);
  if (!id) return "sent";
  return deliverEmail(id);
}

/** Retries whatever is due. Run by the jobs endpoint. */
export async function processEmailQueue(limit = 25): Promise<{ sent: number; pending: number; failed: number }> {
  const due = await prisma.emailOutbox.findMany({
    where: { status: "QUEUED", nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true }
  });
  const tally = { sent: 0, pending: 0, failed: 0 };
  for (const { id } of due) {
    const result = await deliverEmail(id);
    if (result === "sent") tally.sent += 1;
    else if (result === "queued") tally.pending += 1;
    else tally.failed += 1;
  }
  return tally;
}
