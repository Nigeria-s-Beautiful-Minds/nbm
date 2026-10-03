import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, notify } from "@/lib/audit";
import { can } from "@/lib/permissions";
import type { Viewer } from "@/lib/viewer";
import type { ThreadDetail, ThreadMessageView, ThreadSummary } from "@/lib/discussions-shared";

export * from "@/lib/discussions-shared";

export const THREADS_PAGE_SIZE = 15;
export const MESSAGES_PAGE_SIZE = 50;

const threadInclude = {
  host: { select: { name: true } },
  _count: { select: { messages: { where: { visibility: "VISIBLE" as const } } } },
  audioRooms: { where: { status: { in: ["SCHEDULED", "LIVE"] as ("SCHEDULED" | "LIVE")[] } }, select: { id: true, status: true, startsAt: true }, take: 1 }
} satisfies Prisma.ThreadInclude;

type ThreadRow = Prisma.ThreadGetPayload<{ include: typeof threadInclude }>;

function toSummary(row: ThreadRow, viewerId?: string): ThreadSummary {
  const room = row.audioRooms[0];
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    body: row.body,
    status: row.status,
    hostId: row.hostId,
    hostName: row.host.name,
    isHost: row.hostId === viewerId,
    messageCount: row._count.messages,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    room: room ? { id: room.id, status: room.status, startsAt: room.startsAt.toISOString() } : null
  };
}

/** Public threads: open and locked ones, never archived. "recent" is newest first; "active" is latest reply first. */
export async function listThreads({ sort = "recent", topic, page = 1 }: { sort?: "recent" | "active"; topic?: string; page?: number }): Promise<{ items: ThreadSummary[]; total: number }> {
  try {
    // Threads that are the text channel of a live or upcoming room are listed with the rooms instead.
    const where: Prisma.ThreadWhereInput = { status: { not: "ARCHIVED" }, audioRooms: { none: { status: { in: ["SCHEDULED", "LIVE"] } } }, ...(topic ? { topic } : {}) };
    const [rows, total] = await Promise.all([
      prisma.thread.findMany({
        where,
        orderBy: sort === "active" ? { lastActivityAt: "desc" } : { createdAt: "desc" },
        skip: (Math.max(1, page) - 1) * THREADS_PAGE_SIZE,
        take: THREADS_PAGE_SIZE,
        include: threadInclude
      }),
      prisma.thread.count({ where })
    ]);
    return { items: rows.map((row) => toSummary(row)), total };
  } catch (err) {
    console.error("listThreads failed:", err);
    return { items: [], total: 0 };
  }
}

export async function getThread(id: string, viewer: Viewer | null): Promise<ThreadDetail | null> {
  const row = await prisma.thread.findUnique({ where: { id }, include: threadInclude });
  if (!row) return null;
  // Archived threads are gone from public view; the host and moderators can still open them.
  if (row.status === "ARCHIVED" && row.hostId !== viewer?.id && !can(viewer?.roles, "moderation")) return null;
  return { ...toSummary(row, viewer?.id), referenceUrl: row.referenceUrl, summary: row.summary };
}

export async function createThread(viewer: Viewer, input: { title: string; topic: string; body: string; referenceUrl: string | null }): Promise<string> {
  const row = await prisma.thread.create({ data: { hostId: viewer.id, ...input } });
  return row.id;
}

const messageInclude = {
  author: { select: { name: true } },
  parent: { select: { body: true, visibility: true, author: { select: { name: true } } } }
} satisfies Prisma.ThreadMessageInclude;

type MessageRow = Prisma.ThreadMessageGetPayload<{ include: typeof messageInclude }>;

function toMessage(row: MessageRow, hostId: string, viewerId: string | undefined, blockedIds: Set<string>): ThreadMessageView {
  const removed = row.visibility !== "VISIBLE";
  const hidden = blockedIds.has(row.authorId);
  return {
    id: row.id,
    // Removed text never leaves the server; text from someone the viewer blocked is withheld too.
    body: removed || hidden ? "" : row.body,
    removed,
    hiddenByBlock: hidden && !removed,
    createdAt: row.createdAt.toISOString(),
    edited: Boolean(row.editedAt),
    authorId: row.authorId,
    authorName: removed || hidden ? "" : row.author.name,
    isOwn: row.authorId === viewerId,
    isHost: row.authorId === hostId,
    replyTo: row.parent && row.parent.visibility === "VISIBLE" ? { authorName: row.parent.author.name, excerpt: row.parent.body.slice(0, 140) } : null
  };
}

async function blockedBy(viewerId: string | undefined): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const rows = await prisma.userBlock.findMany({ where: { blockerId: viewerId }, select: { blockedId: true } });
  return new Set(rows.map((row) => row.blockedId));
}

/**
 * Messages in a thread, oldest first.
 *   after  — only messages newer than this id (what an open page polls for)
 *   before — the page of messages older than this id ("Load earlier messages")
 *   neither — the most recent page
 */
export async function listMessages(threadId: string, viewerId: string | undefined, { after, before }: { after?: string; before?: string } = {}): Promise<{ messages: ThreadMessageView[]; hasEarlier: boolean }> {
  const thread = await prisma.thread.findUnique({ where: { id: threadId }, select: { hostId: true } });
  if (!thread) return { messages: [], hasEarlier: false };
  const blocked = await blockedBy(viewerId);
  const order = [{ createdAt: "asc" as const }, { id: "asc" as const }];

  if (after) {
    const rows = await prisma.threadMessage.findMany({ where: { threadId }, orderBy: order, cursor: { id: after }, skip: 1, take: 200, include: messageInclude }).catch(() => []);
    return { messages: rows.map((row) => toMessage(row, thread.hostId, viewerId, blocked)), hasEarlier: false };
  }

  const rows = await prisma.threadMessage
    .findMany({
      where: { threadId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      take: MESSAGES_PAGE_SIZE + 1,
      include: messageInclude
    })
    .catch(() => []);
  const hasEarlier = rows.length > MESSAGES_PAGE_SIZE;
  return { messages: rows.slice(0, MESSAGES_PAGE_SIZE).reverse().map((row) => toMessage(row, thread.hostId, viewerId, blocked)), hasEarlier };
}

type MessageResult = { message: ThreadMessageView } | { error: string; status: number };

/**
 * Posts a message. `clientId` is generated by the browser once per message, so a retry after a
 * dropped connection returns the message that was already saved instead of adding a second one.
 */
export async function createMessage(threadId: string, viewer: Viewer, body: string, clientId: string, parentId: string | null): Promise<MessageResult> {
  const thread = await prisma.thread.findUnique({ where: { id: threadId }, select: { status: true, hostId: true, title: true } });
  if (!thread || thread.status === "ARCHIVED") return { error: "Discussion not found.", status: 404 };
  // Enforced here, not just by hiding the form: a locked thread rejects every new message.
  if (thread.status !== "OPEN") return { error: "This discussion is locked, so new messages can't be added.", status: 409 };
  if (await prisma.userBlock.findFirst({ where: { blockerId: thread.hostId, blockedId: viewer.id }, select: { id: true } })) {
    return { error: "The host has blocked you from this discussion.", status: 403 };
  }

  const existing = await prisma.threadMessage.findUnique({ where: { authorId_clientId: { authorId: viewer.id, clientId } }, include: messageInclude });
  if (existing) return { message: toMessage(existing, thread.hostId, viewer.id, new Set()) };

  let parent: { id: string; authorId: string } | null = null;
  if (parentId) {
    parent = await prisma.threadMessage.findFirst({ where: { id: parentId, threadId, visibility: "VISIBLE" }, select: { id: true, authorId: true } });
    if (!parent) return { error: "The message you're replying to is no longer there.", status: 404 };
  }

  let row: MessageRow;
  try {
    [row] = await prisma.$transaction([
      prisma.threadMessage.create({ data: { threadId, authorId: viewer.id, body, clientId, parentId: parent?.id ?? null }, include: messageInclude }),
      prisma.thread.update({ where: { id: threadId }, data: { lastActivityAt: new Date() } })
    ]);
  } catch (err) {
    // Two copies of the same send raced each other: the unique (authorId, clientId) kept one.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.threadMessage.findUnique({ where: { authorId_clientId: { authorId: viewer.id, clientId } }, include: messageInclude });
      if (winner) return { message: toMessage(winner, thread.hostId, viewer.id, new Set()) };
    }
    throw err;
  }

  const href = `/discussion/${threadId}`;
  const recipients = new Set([thread.hostId, parent?.authorId].filter((id): id is string => Boolean(id) && id !== viewer.id));
  for (const userId of recipients) {
    await notify({ userId, type: "reply", title: `${viewer.name} ${userId === parent?.authorId ? "replied to you" : "posted"} in "${thread.title}"`, body: body.slice(0, 240), href, email: "replies" });
  }
  return { message: toMessage(row, thread.hostId, viewer.id, new Set()) };
}

/** Members edit only their own messages, and only while the thread is open. */
export async function editMessage(messageId: string, viewer: Viewer, body: string): Promise<MessageResult> {
  const row = await prisma.threadMessage.findUnique({ where: { id: messageId }, select: { authorId: true, visibility: true, thread: { select: { status: true, hostId: true } } } });
  if (!row || row.visibility !== "VISIBLE") return { error: "Message not found.", status: 404 };
  if (row.authorId !== viewer.id) return { error: "You can only edit your own messages.", status: 403 };
  if (row.thread.status !== "OPEN") return { error: "This discussion is locked.", status: 409 };
  const updated = await prisma.threadMessage.update({ where: { id: messageId }, data: { body, editedAt: new Date() }, include: messageInclude });
  return { message: toMessage(updated, row.thread.hostId, viewer.id, new Set()) };
}

/**
 * Removes a message. Its author can remove their own; a host can remove messages in their own
 * thread (never in someone else's); moderators can remove anywhere. Host and staff removals are audited.
 */
export async function removeMessage(messageId: string, viewer: Viewer): Promise<boolean> {
  const row = await prisma.threadMessage.findUnique({ where: { id: messageId }, select: { authorId: true, thread: { select: { hostId: true } } } });
  if (!row) return false;
  const own = row.authorId === viewer.id;
  const hostOfThread = row.thread.hostId === viewer.id;
  const moderator = can(viewer.roles, "moderation");
  if (!own && !hostOfThread && !moderator) return false;
  await prisma.$transaction(async (tx) => {
    await tx.threadMessage.update({ where: { id: messageId }, data: { visibility: "REMOVED" } });
    if (!own) await audit(tx, { actorId: viewer.id, action: moderator && !hostOfThread ? "message.remove.staff" : "message.remove.host", targetType: "THREAD_MESSAGE", targetId: messageId, reason: "Removed as disruptive" });
  });
  return true;
}

/** A host locks or reopens their own thread; moderators can also archive any thread. */
export async function setThreadStatus(threadId: string, viewer: Viewer, status: "OPEN" | "LOCKED" | "ARCHIVED", reason?: string): Promise<{ ok: boolean; error?: string }> {
  const thread = await prisma.thread.findUnique({ where: { id: threadId }, select: { hostId: true, status: true, title: true } });
  if (!thread) return { ok: false, error: "Discussion not found." };
  const moderator = can(viewer.roles, "moderation");
  const host = thread.hostId === viewer.id;
  if (!host && !moderator) return { ok: false, error: "Only the host can do that." };
  if (status === "ARCHIVED" && !moderator) return { ok: false, error: "Only moderators can archive a discussion." };
  // A thread a moderator archived can't be reopened by its host.
  if (thread.status === "ARCHIVED" && !moderator) return { ok: false, error: "This discussion was archived by moderators." };
  if (!host && (!reason || reason.trim().length < 5)) return { ok: false, error: "Please give a reason. It is recorded." };

  await prisma.$transaction(async (tx) => {
    await tx.thread.update({ where: { id: threadId }, data: { status } });
    await audit(tx, { actorId: viewer.id, action: `thread.${status.toLowerCase()}`, targetType: "THREAD", targetId: threadId, reason: reason?.trim() || (host ? "By host" : null) });
  });
  if (!host) await notify({ userId: thread.hostId, type: "moderation", title: `Moderators ${status === "OPEN" ? "reopened" : status === "LOCKED" ? "locked" : "archived"} your discussion "${thread.title}"`, body: reason ? `Note: ${reason.trim()}` : undefined, href: `/discussion/${threadId}`, email: "always" });
  return { ok: true };
}

export async function setThreadSummary(threadId: string, viewer: Viewer, summary: string): Promise<boolean> {
  const result = await prisma.thread.updateMany({ where: { id: threadId, hostId: viewer.id }, data: { summary: summary || null } });
  return result.count > 0;
}

export async function setBlocked(blockerId: string, blockedId: string, blocked: boolean): Promise<void> {
  if (blockerId === blockedId) return;
  if (blocked) {
    await prisma.userBlock.upsert({ where: { blockerId_blockedId: { blockerId, blockedId } }, update: {}, create: { blockerId, blockedId } });
  } else {
    await prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
  }
}
