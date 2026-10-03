import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { baseUrl } from "@/lib/config";
import { queueEmail, deliverEmail, renderEmail } from "@/lib/mailer";

type Db = PrismaClient | Prisma.TransactionClient;

/** Records a staff or system action. Rejections, removals and funding changes must pass a reason. */
export async function audit(
  db: Db,
  entry: { actorId: string | null; action: string; targetType: string; targetId: string; reason?: string | null; metadata?: Prisma.InputJsonValue }
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason || null,
      metadata: entry.metadata
    }
  });
}

type Notice = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  href?: string;
  /** "always" for moderation, match and payment notices; otherwise the member's preference decides. */
  email?: "always" | "replies" | "updates" | "never";
  dedupeKey?: string;
};

/** In-app notification, plus an email when the member's settings allow it. */
export async function notify(notice: Notice): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: notice.userId },
      select: { email: true, emailOnReplies: true, emailOnUpdates: true, suspendedAt: true }
    });
    if (!user || user.suspendedAt) return;

    await prisma.notification.create({
      data: { userId: notice.userId, type: notice.type, title: notice.title, body: notice.body, href: notice.href }
    });

    const mode = notice.email ?? "never";
    const wantsEmail = mode === "always" || (mode === "replies" && user.emailOnReplies) || (mode === "updates" && user.emailOnUpdates);
    if (!wantsEmail) return;

    const id = await queueEmail(prisma, {
      to: user.email,
      subject: notice.title,
      kind: `notification:${notice.type}`,
      dedupeKey: notice.dedupeKey,
      html: renderEmail({
        heading: notice.title,
        paragraphs: notice.body ? [notice.body] : [],
        action: notice.href ? { label: "Open in NBM", url: `${baseUrl()}${notice.href}` } : undefined,
        footnote: "You can change which emails you receive in your NBM account settings."
      })
    });
    if (id) await deliverEmail(id);
  } catch (err) {
    // A notification must never break the action that triggered it.
    console.error("notify failed:", err);
  }
}
