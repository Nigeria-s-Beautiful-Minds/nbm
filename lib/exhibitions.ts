import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/storage";
import { mediaUrl } from "@/lib/uploads";
import { audit, notify } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { getLimits } from "@/lib/config";
import { PROJECT_STAGES, REACTIONS, TEXT_LIMITS, TOPICS, slugify, type ReactionEmoji } from "@/lib/constants";
import { randomToken } from "@/lib/tokens";
import type { Viewer } from "@/lib/viewer";
import type { CommentNode, ExhibitionDetail, ExhibitionInput, ExhibitionSummary, MediaItem } from "@/lib/exhibitions-shared";

export * from "@/lib/exhibitions-shared";

const mediaInclude = { where: { live: true }, orderBy: { sortOrder: "asc" as const } };

const summaryInclude = {
  author: { select: { name: true } },
  media: mediaInclude,
  _count: { select: { comments: { where: { visibility: "VISIBLE" as const } }, reactions: true } }
} satisfies Prisma.ExhibitionInclude;

type SummaryRow = Prisma.ExhibitionGetPayload<{ include: typeof summaryInclude }>;

function toMedia(row: { id: string; uploadId: string; kind: string; alt: string; width: number | null; height: number | null; durationSec: number | null }): MediaItem {
  return { id: row.id, uploadId: row.uploadId, url: mediaUrl(row.uploadId), kind: row.kind as MediaItem["kind"], alt: row.alt, width: row.width, height: row.height, durationSec: row.durationSec };
}

function toSummary(row: SummaryRow, viewerId?: string): ExhibitionSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    topic: row.topic,
    stage: row.stage,
    status: row.status,
    revisionStatus: row.revisionStatus,
    featured: row.featured,
    authorId: row.authorId,
    authorName: row.author.name,
    isOwn: row.authorId === viewerId,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    cover: row.media[0] ? toMedia(row.media[0]) : null,
    mediaCount: row.media.length,
    commentCount: row._count.comments,
    reactionTotal: row._count.reactions
  };
}

export const EXHIBITIONS_PAGE_SIZE = 12;

/** Approved posts only, newest first. A database hiccup returns an empty page instead of a 500. */
export async function listPublicExhibitions({ topic, page = 1, pageSize = EXHIBITIONS_PAGE_SIZE }: { topic?: string; page?: number; pageSize?: number }): Promise<{ items: ExhibitionSummary[]; total: number }> {
  try {
    const where: Prisma.ExhibitionWhereInput = { status: "APPROVED", ...(topic ? { topic } : {}) };
    const [rows, total] = await Promise.all([
      prisma.exhibition.findMany({ where, orderBy: { publishedAt: "desc" }, skip: (Math.max(1, page) - 1) * pageSize, take: pageSize, include: summaryInclude }),
      prisma.exhibition.count({ where })
    ]);
    return { items: rows.map((row) => toSummary(row)), total };
  } catch (err) {
    console.error("listPublicExhibitions failed:", err);
    return { items: [], total: 0 };
  }
}

/** Home's featured project: the staff-selected one when there is one, otherwise the newest approved post. */
export async function getFeaturedExhibitions(count = 3): Promise<ExhibitionSummary[]> {
  try {
    const rows = await prisma.exhibition.findMany({
      where: { status: "APPROVED" },
      orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
      take: count,
      include: summaryInclude
    });
    return rows.map((row) => toSummary(row));
  } catch (err) {
    console.error("getFeaturedExhibitions failed:", err);
    return [];
  }
}

export async function listExhibitionsByAuthor(authorId: string): Promise<ExhibitionSummary[]> {
  const rows = await prisma.exhibition.findMany({ where: { authorId }, orderBy: { updatedAt: "desc" }, include: summaryInclude });
  return rows.map((row) => toSummary(row, authorId));
}

export async function listSavedExhibitions(userId: string): Promise<ExhibitionSummary[]> {
  const rows = await prisma.exhibitionSave.findMany({
    where: { userId, exhibition: { status: "APPROVED" } },
    orderBy: { createdAt: "desc" },
    include: { exhibition: { include: summaryInclude } }
  });
  return rows.map((row) => toSummary(row.exhibition, userId));
}

const detailInclude = {
  ...summaryInclude,
  media: { orderBy: { sortOrder: "asc" as const } },
  reactions: { select: { emoji: true, userId: true } },
  linkedThread: { select: { id: true, title: true, status: true } },
  linkedOpportunity: { select: { id: true, title: true, status: true } },
  linkedCampaign: { select: { slug: true, title: true, status: true } }
} satisfies Prisma.ExhibitionInclude;

/**
 * One post, or null when it doesn't exist or this viewer may not see it. Visitors and other
 * members only ever get APPROVED posts; the author and reviewers can see every state.
 */
export async function getExhibitionForViewer(slugOrId: string, viewer: Viewer | null): Promise<ExhibitionDetail | null> {
  const row = await prisma.exhibition.findFirst({ where: { OR: [{ slug: slugOrId }, { id: slugOrId }] }, include: detailInclude });
  if (!row) return null;
  const isOwn = row.authorId === viewer?.id;
  const canReview = can(viewer?.roles, "exhibitions.review");
  if (row.status !== "APPROVED" && !isOwn && !canReview) return null;

  const reactionCounts: Partial<Record<ReactionEmoji, number>> = {};
  let viewerReaction: ReactionEmoji | null = null;
  for (const reaction of row.reactions) {
    if (!(REACTIONS as readonly string[]).includes(reaction.emoji)) continue;
    const emoji = reaction.emoji as ReactionEmoji;
    reactionCounts[emoji] = (reactionCounts[emoji] ?? 0) + 1;
    if (viewer && reaction.userId === viewer.id) viewerReaction = emoji;
  }
  const saved = viewer ? Boolean(await prisma.exhibitionSave.findUnique({ where: { exhibitionId_userId: { exhibitionId: row.id, userId: viewer.id } } })) : false;
  const liveMedia = row.media.filter((m) => m.live);
  const showPrivate = isOwn || canReview;

  return {
    ...toSummary({ ...row, media: liveMedia }, viewer?.id),
    teamCredits: row.teamCredits,
    projectUrl: row.projectUrl,
    media: liveMedia.map(toMedia),
    reactionCounts,
    viewerReaction,
    saved,
    moderationNote: showPrivate ? row.moderationNote : null,
    // The proposed edit is only ever shown to the author and reviewers.
    pendingRevision: showPrivate && row.pendingRevision ? (row.pendingRevision as ExhibitionInput) : null,
    allMedia: showPrivate ? row.media.map(toMedia) : liveMedia.map(toMedia),
    links: {
      thread: row.linkedThread && row.linkedThread.status !== "ARCHIVED" ? { id: row.linkedThread.id, title: row.linkedThread.title } : null,
      opportunity: row.linkedOpportunity?.status === "PUBLISHED" ? { id: row.linkedOpportunity.id, title: row.linkedOpportunity.title } : null,
      campaign: row.linkedCampaign?.status === "OPEN" ? { slug: row.linkedCampaign.slug, title: row.linkedCampaign.title } : null
    },
    linkIds: { threadId: row.linkedThreadId, opportunityId: row.linkedOpportunityId, campaignId: row.linkedCampaignId }
  };
}

// ── Authoring ──

type Checked = { ok: true; data: ExhibitionInput } | { ok: false; error: string };

/** Validates a post's text, links and media against the pilot limits and the author's own uploads. */
export async function checkExhibitionInput(raw: unknown, authorId: string, exhibitionId: string | null, forSubmission: boolean): Promise<Checked> {
  const body = (raw ?? {}) as Record<string, unknown>;
  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : "");
  const title = str("title");
  const description = str("description");
  const topic = str("topic");
  const stage = str("stage");
  const teamCredits = str("teamCredits");
  const projectUrl = str("projectUrl");

  if (title.length < 3 || title.length > TEXT_LIMITS.title) return { ok: false, error: `Please give your project a title (3–${TEXT_LIMITS.title} characters).` };
  if (description.length > TEXT_LIMITS.description) return { ok: false, error: `The description can be up to ${TEXT_LIMITS.description} characters.` };
  if (forSubmission && description.length < 30) return { ok: false, error: "Please describe your project in at least a couple of sentences before submitting." };
  if (topic && !(TOPICS as readonly string[]).includes(topic)) return { ok: false, error: "Please choose a topic from the list." };
  if (stage && !(stage in PROJECT_STAGES)) return { ok: false, error: "Please choose a project stage from the list." };
  if (forSubmission && (!topic || !stage)) return { ok: false, error: "Please choose a topic and a project stage before submitting." };
  if (teamCredits.length > 500) return { ok: false, error: "Team credits can be up to 500 characters." };
  if (projectUrl && !/^https?:\/\/[^\s]+$/i.test(projectUrl)) return { ok: false, error: "The project link must start with http:// or https://." };

  const limits = await getLimits();
  const rawMedia = Array.isArray(body.media) ? (body.media as Record<string, unknown>[]) : [];
  const media: ExhibitionInput["media"] = [];
  for (const item of rawMedia) {
    const uploadId = typeof item?.uploadId === "string" ? item.uploadId : "";
    const alt = typeof item?.alt === "string" ? item.alt.trim() : "";
    const upload = uploadId ? await prisma.upload.findUnique({ where: { id: uploadId }, include: { exhibitionMedia: { select: { exhibitionId: true } } } }) : null;
    // Only the author's own, server-verified uploads count, and one already used elsewhere can't be reused.
    if (!upload || upload.userId !== authorId || upload.purpose !== "EXHIBITION_MEDIA" || !upload.verifiedAt) return { ok: false, error: "One of the files didn't upload correctly. Please remove it and try again." };
    if (upload.exhibitionMedia && upload.exhibitionMedia.exhibitionId !== exhibitionId) return { ok: false, error: "One of the files belongs to another post." };
    if (alt.length < 3 || alt.length > TEXT_LIMITS.alt) return { ok: false, error: "Please describe each photo or video in a few words, so people who can't see it know what it shows." };
    const width = Number(item.width);
    const height = Number(item.height);
    const okDims = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && width <= 20000 && height <= 20000;
    media.push({ uploadId, alt, kind: upload.mime.startsWith("video/") ? "VIDEO" : "IMAGE", width: okDims ? Math.round(width) : null, height: okDims ? Math.round(height) : null });
  }
  const videos = media.filter((m) => m.kind === "VIDEO").length;
  if (videos > 1 || (videos === 1 && media.length > 1)) return { ok: false, error: "A post can have one short video, or photos, but not both." };
  if (media.length > limits.imagesPerPost) return { ok: false, error: `A post can have up to ${limits.imagesPerPost} photos.` };
  if (forSubmission && media.length === 0) return { ok: false, error: "Please add at least one photo or a short video before submitting." };

  // Links must point at things that exist and belong to the author.
  const idOrNull = (key: string) => (typeof body[key] === "string" && body[key] ? (body[key] as string) : null);
  const linkedThreadId = idOrNull("linkedThreadId");
  const linkedOpportunityId = idOrNull("linkedOpportunityId");
  const linkedCampaignId = idOrNull("linkedCampaignId");
  if (linkedThreadId && !(await prisma.thread.findFirst({ where: { id: linkedThreadId, hostId: authorId, status: { not: "ARCHIVED" } }, select: { id: true } }))) return { ok: false, error: "That discussion can't be linked." };
  if (linkedOpportunityId && !(await prisma.opportunity.findFirst({ where: { id: linkedOpportunityId, mentorId: authorId, status: "PUBLISHED" }, select: { id: true } }))) return { ok: false, error: "That mentorship opportunity can't be linked." };
  if (linkedCampaignId && !(await prisma.campaign.findFirst({ where: { id: linkedCampaignId, requesterId: authorId, status: "OPEN" }, select: { id: true } }))) return { ok: false, error: "Only an approved sponsorship campaign can be linked." };

  return { ok: true, data: { title, description, topic, stage, teamCredits, projectUrl, linkedThreadId, linkedOpportunityId, linkedCampaignId, media } };
}

function fieldsOf(data: ExhibitionInput) {
  return {
    title: data.title,
    description: data.description,
    topic: data.topic || "Other",
    stage: data.stage || "IDEA",
    teamCredits: data.teamCredits || null,
    projectUrl: data.projectUrl || null,
    linkedThreadId: data.linkedThreadId,
    linkedOpportunityId: data.linkedOpportunityId,
    linkedCampaignId: data.linkedCampaignId
  };
}

/** Makes the post's live media exactly match `media`, deleting anything dropped. Returns storage keys to delete. */
async function applyMedia(tx: Prisma.TransactionClient, exhibitionId: string, media: ExhibitionInput["media"]): Promise<string[]> {
  const existing = await tx.exhibitionMedia.findMany({ where: { exhibitionId }, include: { upload: { select: { id: true, storageKey: true, durationSec: true } } } });
  const keep = new Set(media.map((m) => m.uploadId));
  const removed = existing.filter((m) => !keep.has(m.uploadId));
  if (removed.length) {
    await tx.exhibitionMedia.deleteMany({ where: { id: { in: removed.map((m) => m.id) } } });
    await tx.upload.deleteMany({ where: { id: { in: removed.map((m) => m.uploadId) } } });
  }
  for (const [index, item] of media.entries()) {
    const current = existing.find((m) => m.uploadId === item.uploadId);
    if (current) {
      await tx.exhibitionMedia.update({ where: { id: current.id }, data: { alt: item.alt, sortOrder: index, live: true } });
    } else {
      const upload = await tx.upload.update({ where: { id: item.uploadId }, data: { attached: true } });
      await tx.exhibitionMedia.create({
        data: { exhibitionId, uploadId: item.uploadId, kind: item.kind, alt: item.alt, width: item.width, height: item.height, durationSec: upload.durationSec, sortOrder: index, live: true }
      });
    }
  }
  return removed.map((m) => m.upload.storageKey);
}

export type SaveIntent = "draft" | "submit";
export type SaveResult = { ok: true; id: string; slug: string; status: string; revisionStatus: string; message: string } | { ok: false; error: string; status?: number };

/** Creates or updates a post for its author, and optionally submits it for review. */
export async function saveExhibition(viewer: Viewer, exhibitionId: string | null, raw: unknown, intent: SaveIntent): Promise<SaveResult> {
  const existing = exhibitionId ? await prisma.exhibition.findUnique({ where: { id: exhibitionId } }) : null;
  if (exhibitionId && !existing) return { ok: false, error: "That post no longer exists.", status: 404 };
  // Authors can only ever change their own posts, whatever their role.
  if (existing && existing.authorId !== viewer.id) return { ok: false, error: "You can only edit your own posts.", status: 403 };
  if (existing?.status === "REMOVED") return { ok: false, error: "This post was removed by moderators and can't be edited.", status: 403 };

  const publishDirect = can(viewer.roles, "exhibitions.publishDirect");
  const isLive = existing?.status === "APPROVED";
  const checked = await checkExhibitionInput(raw, viewer.id, existing?.id ?? null, intent === "submit" || isLive);
  if (!checked.ok) return { ok: false, error: checked.error, status: 400 };
  const data = checked.data;

  // An edit to an approved member post waits for review; the approved version stays public meanwhile.
  if (existing && isLive && !publishDirect) {
    await prisma.$transaction(async (tx) => {
      const attachedIds = new Set((await tx.exhibitionMedia.findMany({ where: { exhibitionId: existing.id }, select: { uploadId: true } })).map((m) => m.uploadId));
      for (const [index, item] of data.media.entries()) {
        if (attachedIds.has(item.uploadId)) continue;
        const upload = await tx.upload.update({ where: { id: item.uploadId }, data: { attached: true } });
        await tx.exhibitionMedia.create({
          data: { exhibitionId: existing.id, uploadId: item.uploadId, kind: item.kind, alt: item.alt, width: item.width, height: item.height, durationSec: upload.durationSec, sortOrder: index, live: false }
        });
      }
      await tx.exhibition.update({ where: { id: existing.id }, data: { pendingRevision: data as unknown as Prisma.InputJsonValue, revisionStatus: "PENDING", moderationNote: null } });
    });
    return { ok: true, id: existing.id, slug: existing.slug, status: "APPROVED", revisionStatus: "PENDING", message: "Your changes were sent for review. The current version stays visible until they're approved." };
  }

  const nextStatus = intent === "submit" ? (publishDirect ? "APPROVED" : "PENDING") : existing && existing.status !== "REJECTED" && existing.status !== "WITHDRAWN" ? existing.status : "DRAFT";
  const publishing = nextStatus === "APPROVED" && existing?.status !== "APPROVED";

  let staleKeys: string[] = [];
  const saved = await prisma.$transaction(async (tx) => {
    const row = existing
      ? await tx.exhibition.update({
          where: { id: existing.id },
          data: {
            ...fieldsOf(data),
            status: nextStatus,
            ...(intent === "submit" ? { moderationNote: null } : {}),
            ...(publishing ? { publishedAt: new Date(), reviewedById: viewer.id, reviewedAt: new Date() } : {})
          }
        })
      : await tx.exhibition.create({
          data: {
            ...fieldsOf(data),
            slug: `${slugify(data.title)}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "x")}`,
            authorId: viewer.id,
            status: nextStatus,
            ...(publishing ? { publishedAt: new Date(), reviewedById: viewer.id, reviewedAt: new Date() } : {})
          }
        });
    staleKeys = await applyMedia(tx, row.id, data.media);
    if (publishing) await audit(tx, { actorId: viewer.id, action: "exhibition.publish-direct", targetType: "EXHIBITION", targetId: row.id });
    return row;
  });
  await Promise.all(staleKeys.map((key) => deleteObject(key)));

  const message =
    saved.status === "APPROVED" ? (publishing ? "Published. Your post is now live in Exhibitions." : "Saved.")
    : saved.status === "PENDING" ? "Thank you. Your post is with our reviewers and will appear once it's approved."
    : "Draft saved. Only you can see it.";
  return { ok: true, id: saved.id, slug: saved.slug, status: saved.status, revisionStatus: saved.revisionStatus, message };
}

export async function withdrawExhibition(viewer: Viewer, exhibitionId: string): Promise<boolean> {
  const result = await prisma.exhibition.updateMany({
    where: { id: exhibitionId, authorId: viewer.id, status: { in: ["PENDING", "APPROVED"] } },
    data: { status: "WITHDRAWN", revisionStatus: "NONE", pendingRevision: Prisma.DbNull, featured: false }
  });
  if (result.count > 0) await discardRevisionMedia(exhibitionId);
  return result.count > 0;
}

async function discardRevisionMedia(exhibitionId: string) {
  const pending = await prisma.exhibitionMedia.findMany({ where: { exhibitionId, live: false }, include: { upload: { select: { id: true, storageKey: true } } } });
  if (!pending.length) return;
  await prisma.upload.deleteMany({ where: { id: { in: pending.map((m) => m.upload.id) } } });
  await Promise.all(pending.map((m) => deleteObject(m.upload.storageKey)));
}

/** Authors may delete their own post outright; its media goes with it. */
export async function deleteExhibition(viewer: Viewer, exhibitionId: string): Promise<boolean> {
  const row = await prisma.exhibition.findFirst({ where: { id: exhibitionId, authorId: viewer.id }, include: { media: { include: { upload: { select: { id: true, storageKey: true } } } } } });
  if (!row) return false;
  await prisma.$transaction([
    prisma.exhibition.delete({ where: { id: row.id } }),
    prisma.upload.deleteMany({ where: { id: { in: row.media.map((m) => m.upload.id) } } })
  ]);
  await Promise.all(row.media.map((m) => deleteObject(m.upload.storageKey)));
  return true;
}

// ── Review (staff) ──

export type ReviewDecision = "approve" | "reject" | "remove" | "approve-revision" | "reject-revision" | "feature" | "unfeature";

export async function reviewExhibition(reviewer: Viewer, exhibitionId: string, decision: ReviewDecision, reason: string): Promise<{ ok: boolean; error?: string }> {
  if (!can(reviewer.roles, "exhibitions.review")) return { ok: false, error: "Not permitted." };
  const row = await prisma.exhibition.findUnique({ where: { id: exhibitionId } });
  if (!row) return { ok: false, error: "That post no longer exists." };
  const needsReason = decision === "reject" || decision === "remove" || decision === "reject-revision";
  if (needsReason && reason.trim().length < 5) return { ok: false, error: "Please give a reason. It is recorded and shared with the author." };

  const stamp = { reviewedById: reviewer.id, reviewedAt: new Date() };
  const href = `/exhibitions/${row.slug}`;

  if (decision === "approve") {
    if (row.status !== "PENDING") return { ok: false, error: "Only posts awaiting review can be approved." };
    await prisma.$transaction(async (tx) => {
      await tx.exhibition.update({ where: { id: row.id }, data: { status: "APPROVED", publishedAt: row.publishedAt ?? new Date(), moderationNote: null, ...stamp } });
      await audit(tx, { actorId: reviewer.id, action: "exhibition.approve", targetType: "EXHIBITION", targetId: row.id });
    });
    await notify({ userId: row.authorId, type: "moderation", title: `Your post "${row.title}" is now live`, body: "It was approved and now appears in Exhibitions.", href, email: "always", dedupeKey: `exh-approved:${row.id}:${Date.now()}` });
  } else if (decision === "reject") {
    if (row.status !== "PENDING") return { ok: false, error: "Only posts awaiting review can be rejected." };
    await prisma.$transaction(async (tx) => {
      await tx.exhibition.update({ where: { id: row.id }, data: { status: "REJECTED", moderationNote: reason.trim(), ...stamp } });
      await audit(tx, { actorId: reviewer.id, action: "exhibition.reject", targetType: "EXHIBITION", targetId: row.id, reason });
    });
    await notify({ userId: row.authorId, type: "moderation", title: `Your post "${row.title}" wasn't approved`, body: `Reviewer's note: ${reason.trim()} You can edit it and submit again.`, href: `/exhibitions/${row.slug}/edit`, email: "always" });
  } else if (decision === "remove") {
    if (row.status !== "APPROVED") return { ok: false, error: "Only published posts can be removed." };
    await prisma.$transaction(async (tx) => {
      await tx.exhibition.update({ where: { id: row.id }, data: { status: "REMOVED", featured: false, moderationNote: reason.trim(), revisionStatus: "NONE", pendingRevision: Prisma.DbNull, ...stamp } });
      await audit(tx, { actorId: reviewer.id, action: "exhibition.remove", targetType: "EXHIBITION", targetId: row.id, reason });
    });
    await discardRevisionMedia(row.id);
    await notify({ userId: row.authorId, type: "moderation", title: `Your post "${row.title}" was removed`, body: `Moderator's note: ${reason.trim()}`, href: "/account/workspace", email: "always" });
  } else if (decision === "approve-revision") {
    if (row.revisionStatus !== "PENDING" || !row.pendingRevision) return { ok: false, error: "There is no edit awaiting review." };
    const revision = row.pendingRevision as unknown as ExhibitionInput;
    let staleKeys: string[] = [];
    await prisma.$transaction(async (tx) => {
      await tx.exhibition.update({ where: { id: row.id }, data: { ...fieldsOf(revision), revisionStatus: "NONE", pendingRevision: Prisma.DbNull, moderationNote: null, ...stamp } });
      staleKeys = await applyMedia(tx, row.id, revision.media);
      await audit(tx, { actorId: reviewer.id, action: "exhibition.approve-revision", targetType: "EXHIBITION", targetId: row.id });
    });
    await Promise.all(staleKeys.map((key) => deleteObject(key)));
    await notify({ userId: row.authorId, type: "moderation", title: `Your changes to "${row.title}" are live`, href, email: "always" });
  } else if (decision === "reject-revision") {
    if (row.revisionStatus !== "PENDING") return { ok: false, error: "There is no edit awaiting review." };
    await prisma.$transaction(async (tx) => {
      await tx.exhibition.update({ where: { id: row.id }, data: { revisionStatus: "REJECTED", pendingRevision: Prisma.DbNull, moderationNote: reason.trim(), ...stamp } });
      await audit(tx, { actorId: reviewer.id, action: "exhibition.reject-revision", targetType: "EXHIBITION", targetId: row.id, reason });
    });
    await discardRevisionMedia(row.id);
    await notify({ userId: row.authorId, type: "moderation", title: `Your changes to "${row.title}" weren't approved`, body: `Reviewer's note: ${reason.trim()} The earlier approved version is still live.`, href: `/exhibitions/${row.slug}/edit`, email: "always" });
  } else {
    if (row.status !== "APPROVED") return { ok: false, error: "Only published posts can be featured." };
    await prisma.$transaction(async (tx) => {
      if (decision === "feature") await tx.exhibition.updateMany({ where: { featured: true }, data: { featured: false } });
      await tx.exhibition.update({ where: { id: row.id }, data: { featured: decision === "feature" } });
      await audit(tx, { actorId: reviewer.id, action: `exhibition.${decision}`, targetType: "EXHIBITION", targetId: row.id });
    });
  }
  return { ok: true };
}

// ── Engagement ──

export async function listComments(exhibitionId: string, viewer: Viewer | null): Promise<CommentNode[]> {
  const rows = await prisma.exhibitionComment.findMany({
    where: { exhibitionId },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: { author: { select: { name: true } } }
  });
  const toNode = (row: (typeof rows)[number]): CommentNode => ({
    id: row.id,
    // A removed comment keeps its place in the thread but never its text.
    body: row.visibility === "VISIBLE" ? row.body : "",
    removed: row.visibility !== "VISIBLE",
    createdAt: row.createdAt.toISOString(),
    authorId: row.authorId,
    authorName: row.visibility === "VISIBLE" ? row.author.name : "",
    isOwn: row.authorId === viewer?.id,
    replies: []
  });
  const top: CommentNode[] = [];
  const byId = new Map<string, CommentNode>();
  for (const row of rows) {
    const node = toNode(row);
    byId.set(row.id, node);
    const parent = row.parentId ? byId.get(row.parentId) : null;
    if (parent) parent.replies.push(node);
    else if (!row.parentId) top.push(node);
  }
  // Removed comments with no replies disappear entirely.
  return top.filter((node) => !node.removed || node.replies.length > 0).map((node) => ({ ...node, replies: node.replies.filter((r) => !r.removed) }));
}

export async function createComment(exhibitionId: string, viewer: Viewer, body: string, parentId: string | null): Promise<{ comment: CommentNode } | { error: string; status: number }> {
  const post = await prisma.exhibition.findUnique({ where: { id: exhibitionId }, select: { status: true, authorId: true, title: true, slug: true } });
  // Only approved posts accept comments: the same rule that decides what is public.
  if (!post || post.status !== "APPROVED") return { error: "This post isn't available for comments.", status: 404 };

  let replyTo: { id: string; authorId: string; parentId: string | null } | null = null;
  if (parentId) {
    replyTo = await prisma.exhibitionComment.findFirst({ where: { id: parentId, exhibitionId, visibility: "VISIBLE" }, select: { id: true, authorId: true, parentId: true } });
    if (!replyTo) return { error: "The comment you're replying to is no longer there.", status: 404 };
  }
  // Replies are one level deep: replying to a reply joins its thread.
  const threadParentId = replyTo ? replyTo.parentId ?? replyTo.id : null;

  const blocked = await prisma.userBlock.findFirst({ where: { blockerId: post.authorId, blockedId: viewer.id }, select: { id: true } });
  if (blocked) return { error: "You can't comment on this member's posts.", status: 403 };

  const row = await prisma.exhibitionComment.create({ data: { exhibitionId, authorId: viewer.id, body, parentId: threadParentId } });
  const href = `/exhibitions/${post.slug}#comments`;
  const notifyIds = new Set([post.authorId, replyTo?.authorId].filter((id): id is string => Boolean(id) && id !== viewer.id));
  for (const userId of notifyIds) {
    await notify({ userId, type: "reply", title: `${viewer.name} ${userId === replyTo?.authorId ? "replied to your comment" : "commented"} on "${post.title}"`, body: body.slice(0, 240), href, email: "replies" });
  }
  return { comment: { id: row.id, body: row.body, removed: false, createdAt: row.createdAt.toISOString(), authorId: viewer.id, authorName: viewer.name, isOwn: true, replies: [] } };
}

/** Authors delete their own comment; moderators hide anyone's, with the action recorded. */
export async function removeComment(commentId: string, viewer: Viewer): Promise<boolean> {
  const row = await prisma.exhibitionComment.findUnique({ where: { id: commentId }, select: { authorId: true } });
  if (!row) return false;
  if (row.authorId === viewer.id) {
    await prisma.exhibitionComment.update({ where: { id: commentId }, data: { visibility: "REMOVED" } });
    return true;
  }
  if (!can(viewer.roles, "moderation")) return false;
  await prisma.$transaction(async (tx) => {
    await tx.exhibitionComment.update({ where: { id: commentId }, data: { visibility: "REMOVED" } });
    await audit(tx, { actorId: viewer.id, action: "comment.remove", targetType: "EXHIBITION_COMMENT", targetId: commentId, reason: "Removed by a moderator" });
  });
  return true;
}

async function isApproved(exhibitionId: string): Promise<boolean> {
  const post = await prisma.exhibition.findUnique({ where: { id: exhibitionId }, select: { status: true } });
  return post?.status === "APPROVED";
}

/** One reaction per member per post: choosing another emoji replaces the first. */
export async function setReaction(exhibitionId: string, userId: string, emoji: ReactionEmoji | null): Promise<boolean> {
  if (!(await isApproved(exhibitionId))) return false;
  if (emoji === null) {
    await prisma.exhibitionReaction.deleteMany({ where: { exhibitionId, userId } });
  } else {
    await prisma.exhibitionReaction.upsert({ where: { exhibitionId_userId: { exhibitionId, userId } }, update: { emoji }, create: { exhibitionId, userId, emoji } });
  }
  return true;
}

export async function setSaved(exhibitionId: string, userId: string, saved: boolean): Promise<boolean> {
  if (!(await isApproved(exhibitionId))) return false;
  if (saved) {
    await prisma.exhibitionSave.upsert({ where: { exhibitionId_userId: { exhibitionId, userId } }, update: {}, create: { exhibitionId, userId } });
  } else {
    await prisma.exhibitionSave.deleteMany({ where: { exhibitionId, userId } });
  }
  return true;
}

export async function reviewQueueCounts() {
  const [pending, revisions] = await Promise.all([
    prisma.exhibition.count({ where: { status: "PENDING" } }),
    prisma.exhibition.count({ where: { status: "APPROVED", revisionStatus: "PENDING" } })
  ]);
  return { pending, revisions };
}

