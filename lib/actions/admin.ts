"use server";

// Staff actions. Every one starts with actionCapability(...), which throws for anyone without
// that specific capability, so one staff role can't perform another role's restricted actions
// by calling these directly.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { audit, notify } from "@/lib/audit";
import { setSetting } from "@/lib/config";
import { DEFAULT_LIMITS, slugify } from "@/lib/constants";
import { NEWS_CATEGORIES } from "@/lib/content";
import { setThreadStatus } from "@/lib/discussions";
import { reviewExhibition, type ReviewDecision } from "@/lib/exhibitions";
import { failure, success, text, zodFailure, type FormState } from "@/lib/forms";
import { deliverEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { roomAction } from "@/lib/rooms";
import { actionCapability } from "@/lib/viewer";

export async function reviewExhibitionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await actionCapability("exhibitions.review");
  const result = await reviewExhibition(staff, text(formData, "id"), text(formData, "decision") as ReviewDecision, text(formData, "reason"));
  if (!result.ok) return failure(formData, result.error || "Could not save.");
  revalidatePath("/admin/exhibitions");
  return success("Saved.");
}

export async function resolveReportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await actionCapability("moderation");
  const status = text(formData, "status");
  const note = text(formData, "note");
  if (status !== "ACTIONED" && status !== "DISMISSED") return failure(formData, "Unknown status.");
  if (note.length < 5) return failure(formData, "Record what you did and why.");
  const id = text(formData, "id");
  await prisma.$transaction(async (tx) => {
    await tx.report.update({ where: { id }, data: { status, resolutionNote: note, handledById: staff.id, handledAt: new Date() } });
    await audit(tx, { actorId: staff.id, action: `report.${status.toLowerCase()}`, targetType: "REPORT", targetId: id, reason: note });
  });
  revalidatePath("/admin/moderation");
  return success("Report closed.");
}

export async function moderateThreadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await actionCapability("moderation");
  const status = text(formData, "status");
  if (status !== "OPEN" && status !== "LOCKED" && status !== "ARCHIVED") return failure(formData, "Unknown status.");
  const result = await setThreadStatus(text(formData, "id"), staff, status, text(formData, "reason"));
  if (!result.ok) return failure(formData, result.error || "Could not save.");
  revalidatePath("/admin/moderation");
  return success("Saved.");
}

export async function endRoomAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await actionCapability("moderation");
  const result = await roomAction(text(formData, "id"), staff, "end");
  if (!result.ok) return failure(formData, result.error);
  revalidatePath("/admin/moderation");
  return success("Room ended.");
}

// ── Operations: volunteers, contacts, mailing list, email queue ──

export async function volunteerStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await actionCapability("operations.manage");
  const status = text(formData, "status");
  if (!["SUBMITTED", "REVIEWING", "ACCEPTED", "DECLINED", "WITHDRAWN"].includes(status)) return failure(formData, "Unknown status.");
  await prisma.volunteerApplication.update({ where: { id: text(formData, "id") }, data: { status: status as "SUBMITTED", notes: text(formData, "notes").slice(0, 2000) || null, assigneeId: staff.id } });
  revalidatePath("/admin/operations");
  return success("Saved.");
}

export async function contactStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await actionCapability("operations.manage");
  const status = text(formData, "status");
  if (!["NEW", "IN_PROGRESS", "RESOLVED", "ARCHIVED"].includes(status)) return failure(formData, "Unknown status.");
  await prisma.contactRequest.update({ where: { id: text(formData, "id") }, data: { status: status as "NEW", notes: text(formData, "notes").slice(0, 2000) || null, assigneeId: staff.id } });
  revalidatePath("/admin/operations");
  return success("Saved.");
}

export async function retryEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await actionCapability("operations.manage");
  const id = text(formData, "id");
  // A failed message is put back in the queue once; its dedupe key still stops a second copy being created.
  await prisma.emailOutbox.updateMany({ where: { id, status: { in: ["FAILED", "QUEUED"] } }, data: { status: "QUEUED", nextAttemptAt: new Date(), createdAt: new Date() } });
  const result = await deliverEmail(id);
  revalidatePath("/admin/email");
  return result === "sent" ? success("Sent.") : failure(formData, "Still not delivered. See the error shown for this message.");
}

// ── Content: news, team, pages ──

const newsSchema = z.object({
  title: z.string().trim().min(5, "Add a title.").max(180),
  category: z.enum(NEWS_CATEGORIES, { errorMap: () => ({ message: "Choose a category." }) }),
  excerpt: z.string().trim().min(20, "Add a one or two sentence excerpt.").max(400),
  body: z.string().trim().min(40, "Write the article body.").max(40000),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  coverAlt: z.string().trim().max(300).optional(),
  linkedExhibitionSlug: z.string().trim().max(120).optional()
});

async function claimImage(uploadId: string, purpose: "NEWS_COVER" | "TEAM_PHOTO", userId: string): Promise<boolean> {
  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.purpose !== purpose || !upload.verifiedAt || upload.userId !== userId) return false;
  await prisma.upload.update({ where: { id: uploadId }, data: { attached: true } });
  return true;
}

export async function saveNewsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await actionCapability("content.edit");
  const parsed = newsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodFailure(formData, parsed.error);
  const d = parsed.data;
  const id = text(formData, "id");
  const existing = id ? await prisma.newsArticle.findUnique({ where: { id } }) : null;
  if (id && !existing) return failure(formData, "Article not found.");

  let linkedExhibitionId: string | null = null;
  if (d.linkedExhibitionSlug) {
    const exhibition = await prisma.exhibition.findFirst({ where: { slug: d.linkedExhibitionSlug.replace(/^.*\/exhibitions\//, ""), status: "APPROVED" }, select: { id: true } });
    if (!exhibition) return failure(formData, "That exhibition wasn't found among published projects.", { linkedExhibitionSlug: "Not found." });
    linkedExhibitionId = exhibition.id;
  }
  const coverUploadId = text(formData, "coverUploadId") || null;
  if (coverUploadId && coverUploadId !== existing?.coverUploadId && !(await claimImage(coverUploadId, "NEWS_COVER", staff.id))) return failure(formData, "The cover image didn't upload correctly.");
  if (coverUploadId && !d.coverAlt) return failure(formData, "Describe the cover image for people who can't see it.", { coverAlt: "Required with an image." });

  const data = {
    title: d.title, category: d.category, excerpt: d.excerpt, body: d.body, status: d.status, coverUploadId, coverAlt: d.coverAlt || null, linkedExhibitionId,
    // The publication date is set the first time an article goes public and kept after that.
    publishedAt: d.status === "PUBLISHED" ? existing?.publishedAt ?? new Date() : existing?.publishedAt ?? null
  };
  const saved = existing
    ? await prisma.newsArticle.update({ where: { id: existing.id }, data })
    : await prisma.newsArticle.create({ data: { ...data, authorId: staff.id, slug: `${slugify(d.title)}-${Date.now().toString(36)}` } });
  await audit(prisma, { actorId: staff.id, action: `news.${d.status.toLowerCase()}`, targetType: "NEWS", targetId: saved.id });
  revalidatePath("/admin/content");
  if (!existing) redirect(`/admin/content/news/${saved.id}?saved=1`);
  return success(d.status === "PUBLISHED" ? "Saved and published." : d.status === "DRAFT" ? "Draft saved. Only editors can preview it." : "Archived. It is no longer public.");
}

const teamSchema = z.object({
  name: z.string().trim().min(2, "Add a name.").max(120),
  roleTitle: z.string().trim().min(2, "Add a role.").max(160),
  group: z.enum(["STAFF", "ADVISER", "COMMITTEE"]),
  bio: z.string().trim().min(10, "Add a short biography.").max(1500),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0)
});

export async function saveTeamMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await actionCapability("content.edit");
  const parsed = teamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodFailure(formData, parsed.error);
  const id = text(formData, "id");
  const existing = id ? await prisma.teamMember.findUnique({ where: { id } }) : null;
  const photoUploadId = text(formData, "photoUploadId") || null;
  if (photoUploadId && photoUploadId !== existing?.photoUploadId && !(await claimImage(photoUploadId, "TEAM_PHOTO", staff.id))) return failure(formData, "The photo didn't upload correctly.");
  const published = formData.get("published") === "on";
  // Publishing a profile is a statement that the person and their details are real and approved.
  if (published && formData.get("confirmed") !== "on") return failure(formData, "Confirm that this person has approved their name, role, photo and biography before publishing.");
  const data = { ...parsed.data, photoUploadId, published };
  const saved = existing ? await prisma.teamMember.update({ where: { id: existing.id }, data }) : await prisma.teamMember.create({ data });
  await audit(prisma, { actorId: staff.id, action: published ? "team.publish" : "team.save", targetType: "TEAM_MEMBER", targetId: saved.id });
  revalidatePath("/admin/content");
  return success(published ? "Saved and published on the team page." : "Saved (not public).");
}

export async function deleteTeamMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await actionCapability("content.edit");
  const id = text(formData, "id");
  await prisma.teamMember.delete({ where: { id } });
  await audit(prisma, { actorId: staff.id, action: "team.delete", targetType: "TEAM_MEMBER", targetId: id });
  revalidatePath("/admin/content");
  return success("Removed.");
}

const pageSchema = z.object({
  slug: z.enum(["about", "privacy", "terms", "community-standards"]),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(40, "Write the page content.").max(60000),
  effectiveDate: z.string().optional(),
  intent: z.enum(["draft", "publish"])
});

/** Saving never edits a published version in place: it writes a new version, so policy history is kept. */
export async function savePageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await actionCapability("content.edit");
  const parsed = pageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodFailure(formData, parsed.error);
  const d = parsed.data;
  const publish = d.intent === "publish";
  if (publish && (d.slug === "privacy" || d.slug === "terms") && formData.get("reviewed") !== "on") {
    return failure(formData, "Confirm that the founder has had this policy reviewed and approved before publishing it.");
  }
  const effectiveDate = d.effectiveDate ? new Date(`${d.effectiveDate}T00:00:00Z`) : publish ? new Date() : null;
  const latest = await prisma.pageVersion.findFirst({ where: { slug: d.slug }, orderBy: { version: "desc" } });
  const fields = { title: d.title, body: d.body, effectiveDate, status: publish ? ("PUBLISHED" as const) : ("DRAFT" as const), publishedAt: publish ? new Date() : null, createdById: staff.id };

  const saved = await prisma.$transaction(async (tx) => {
    // Keep working on the newest draft; anything already published stays as history.
    const row = latest?.status === "DRAFT"
      ? await tx.pageVersion.update({ where: { id: latest.id }, data: fields })
      : await tx.pageVersion.create({ data: { ...fields, slug: d.slug, version: (latest?.version ?? 0) + 1 } });
    if (publish) await tx.pageVersion.updateMany({ where: { slug: d.slug, status: "PUBLISHED", id: { not: row.id } }, data: { status: "ARCHIVED" } });
    await audit(tx, { actorId: staff.id, action: publish ? "page.publish" : "page.draft", targetType: "PAGE", targetId: `${d.slug}@v${row.version}` });
    return row;
  });
  revalidatePath("/admin/content");
  return success(publish ? `Version ${saved.version} published.` : `Draft of version ${saved.version} saved. The public page hasn't changed.`);
}

// ── Users and settings (administrators only) ──

const ASSIGNABLE: Role[] = ["EDITOR", "MODERATOR", "COORDINATOR", "FINANCE", "ADMIN"];

export async function setRolesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await actionCapability("users.manage");
  const userId = text(formData, "userId");
  const roles = ASSIGNABLE.filter((role) => formData.get(`role_${role}`) === "on");
  if (userId === admin.id && !roles.includes("ADMIN")) return failure(formData, "You can't remove your own administrator role. Ask another administrator.");
  const reason = text(formData, "reason");
  if (reason.length < 5) return failure(formData, "Record why these roles are changing.");
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  if (!target) return failure(formData, "Account not found.");
  if (roles.length > 0 && !target.emailVerified) return failure(formData, "Staff roles can only be given to accounts with a confirmed email address.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { roles: ["MEMBER", ...roles] } });
    await audit(tx, { actorId: admin.id, action: "user.roles", targetType: "USER", targetId: userId, reason, metadata: { roles } });
  });
  await notify({ userId, type: "account", title: "Your NBM staff roles were updated", body: roles.length ? `You now have: ${roles.join(", ").toLowerCase()}.` : "You no longer have staff roles.", href: roles.length ? "/admin" : "/account/workspace", email: "always" });
  revalidatePath("/admin/users");
  return success("Roles updated. The change applies immediately.");
}

export async function suspendUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await actionCapability("users.manage");
  const userId = text(formData, "userId");
  const suspend = text(formData, "suspend") === "true";
  const reason = text(formData, "reason");
  if (userId === admin.id) return failure(formData, "You can't suspend your own account.");
  if (reason.length < 5) return failure(formData, "Record the reason.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { suspendedAt: suspend ? new Date() : null } });
    await audit(tx, { actorId: admin.id, action: suspend ? "user.suspend" : "user.reinstate", targetType: "USER", targetId: userId, reason });
  });
  revalidatePath("/admin/users");
  return success(suspend ? "Account suspended. They are signed out everywhere at once." : "Account reinstated.");
}

export async function saveSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await actionCapability("settings.manage");
  const limits: Record<string, number> = {};
  for (const key of Object.keys(DEFAULT_LIMITS)) {
    const value = Number(text(formData, key));
    if (!Number.isInteger(value) || value < 1 || value > 100000) return failure(formData, "Each limit must be a whole number greater than zero.", { [key]: "Whole number." });
    limits[key] = value;
  }
  const committees = text(formData, "committees").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 20);
  if (committees.length === 0) return failure(formData, "Keep at least one volunteer committee.");
  await setSetting("pilotLimits", limits);
  await setSetting("volunteerCommittees", committees);
  await setSetting("optimaisRelationshipConfirmed", formData.get("optimaisRelationshipConfirmed") === "on");
  await setSetting("paymentsLiveConfirmed", formData.get("paymentsLiveConfirmed") === "on");
  await audit(prisma, { actorId: admin.id, action: "settings.update", targetType: "SETTINGS", targetId: "site", metadata: { limits, committees, paymentsLiveConfirmed: formData.get("paymentsLiveConfirmed") === "on" } });
  revalidatePath("/admin/settings");
  return success("Settings saved.");
}
