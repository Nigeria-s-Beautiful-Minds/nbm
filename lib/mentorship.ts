// Mentorship: mentor verification, opportunities, private applications, human-assisted matching
// and the project workspace. Matching here never promises admission, employment, funding or a
// publication; money lives in Sponsorship records, not here.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, notify } from "@/lib/audit";
import { can } from "@/lib/permissions";
import type { Viewer } from "@/lib/viewer";

export const MATCH_OFFER_DAYS = 14;

type Outcome = { ok: true; id?: string } | { ok: false; error: string };
const fail = (error: string): Outcome => ({ ok: false, error });

// ── Opportunities ──

export async function listPublishedOpportunities({ topic, mode }: { topic?: string; mode?: string } = {}) {
  try {
    return await prisma.opportunity.findMany({
      where: { status: "PUBLISHED", ...(topic ? { topic } : {}), ...(mode ? { workingMode: mode as "REMOTE" | "LOCAL" | "HYBRID" } : {}) },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { mentor: { select: { name: true, mentorProfile: { select: { kind: true, affiliation: true, status: true } } } } }
    });
  } catch (err) {
    console.error("listPublishedOpportunities failed:", err);
    return [];
  }
}

/** Published opportunities are public; anything else only for its mentor and coordinators. */
export async function getOpportunity(id: string, viewer: Viewer | null) {
  const row = await prisma.opportunity.findUnique({
    where: { id },
    include: { mentor: { select: { id: true, name: true, mentorProfile: { select: { kind: true, affiliation: true, status: true, expertise: true } } } } }
  });
  if (!row) return null;
  if (row.status !== "PUBLISHED" && row.status !== "CLOSED" && row.mentorId !== viewer?.id && !can(viewer?.roles, "mentorship.coordinate")) return null;
  return row;
}

export type OpportunityInput = {
  title: string; scope: string; skills: string[]; learningGoals: string; duration: string; hoursPerWeek: string; location: string;
  workingMode: "REMOTE" | "LOCAL" | "HYBRID"; facilities: string | null; fundingStatus: string; fundingNote: string | null; topic: string; capacity: number;
};

/** Verified mentors propose opportunities (reviewed before publishing); coordinators publish directly. */
export async function createOpportunity(viewer: Viewer, input: OpportunityInput): Promise<Outcome> {
  const coordinator = can(viewer.roles, "mentorship.coordinate");
  const profile = await prisma.mentorProfile.findUnique({ where: { userId: viewer.id }, select: { status: true } });
  if (!coordinator && profile?.status !== "VERIFIED") return fail("Only verified mentors can post opportunities.");
  const row = await prisma.opportunity.create({ data: { ...input, mentorId: viewer.id, status: coordinator ? "PUBLISHED" : "PENDING" } });
  return { ok: true, id: row.id };
}

export async function closeOwnOpportunity(viewer: Viewer, id: string): Promise<Outcome> {
  const changed = await prisma.opportunity.updateMany({ where: { id, mentorId: viewer.id, status: { in: ["PUBLISHED", "PENDING"] } }, data: { status: "CLOSED" } });
  return changed.count ? { ok: true } : fail("That opportunity can't be closed.");
}

// ── Applications ──

export type ApplicationInput = { interests: string; experience: string; motivation: string; goals: string; availability: string; location: string; documentUploadId: string | null };

/** Saves the applicant's own application as a draft, or submits it (keeping a dated copy of what was submitted). */
export async function saveApplication(viewer: Viewer, applicationId: string | null, opportunityId: string | null, input: ApplicationInput, submit: boolean): Promise<Outcome> {
  const existing = applicationId ? await prisma.mentorshipApplication.findFirst({ where: { id: applicationId, applicantId: viewer.id } }) : null;
  if (applicationId && !existing) return fail("Application not found.");
  if (existing && existing.status !== "DRAFT") return fail("This application has already been submitted. Withdraw it if you want to start again.");

  if (opportunityId) {
    const opportunity = await prisma.opportunity.findUnique({ where: { id: opportunityId }, select: { status: true, mentorId: true } });
    if (!opportunity || opportunity.status !== "PUBLISHED") return fail("That opportunity is no longer open.");
    if (opportunity.mentorId === viewer.id) return fail("You can't apply to your own opportunity.");
    const duplicate = await prisma.mentorshipApplication.findFirst({
      where: { applicantId: viewer.id, opportunityId, status: { in: ["SUBMITTED", "REVIEWING", "MATCH_PROPOSED", "ACTIVE"] }, ...(existing ? { id: { not: existing.id } } : {}) },
      select: { id: true }
    });
    if (duplicate) return fail("You already have an application for this opportunity.");
  }

  if (input.documentUploadId && input.documentUploadId !== existing?.documentUploadId) {
    const upload = await prisma.upload.findUnique({ where: { id: input.documentUploadId }, include: { application: { select: { id: true } } } });
    if (!upload || upload.userId !== viewer.id || upload.purpose !== "APPLICATION_DOCUMENT" || !upload.verifiedAt || upload.application) return fail("The document didn't upload correctly. Please attach it again.");
  }

  const now = new Date();
  const data = {
    ...input,
    opportunityId: existing ? existing.opportunityId : opportunityId,
    status: submit ? ("SUBMITTED" as const) : ("DRAFT" as const),
    ...(submit ? { submittedAt: now, submittedVersion: { ...input, submittedAt: now.toISOString() } as Prisma.InputJsonValue } : {})
  };
  const row = await prisma.$transaction(async (tx) => {
    if (input.documentUploadId) await tx.upload.update({ where: { id: input.documentUploadId }, data: { attached: true } });
    return existing ? tx.mentorshipApplication.update({ where: { id: existing.id }, data }) : tx.mentorshipApplication.create({ data: { ...data, applicantId: viewer.id } });
  });
  return { ok: true, id: row.id };
}

/** The applicant can withdraw until the placement is active. Any open match offer closes with it. */
export async function withdrawApplication(viewer: Viewer, applicationId: string): Promise<Outcome> {
  const done = await prisma.$transaction(async (tx) => {
    const changed = await tx.mentorshipApplication.updateMany({
      where: { id: applicationId, applicantId: viewer.id, status: { in: ["DRAFT", "SUBMITTED", "REVIEWING", "MATCH_PROPOSED"] } },
      data: { status: "WITHDRAWN" }
    });
    if (changed.count === 0) return false;
    await tx.match.updateMany({ where: { applicationId, status: "PROPOSED" }, data: { status: "CLOSED", closedAt: new Date() } });
    return true;
  });
  return done ? { ok: true } : fail("This application can't be withdrawn.");
}

/** Who may read an application: the applicant, coordinators, and a mentor only via a match proposed to them. */
export async function getApplicationForViewer(id: string, viewer: Viewer) {
  const row = await prisma.mentorshipApplication.findUnique({
    where: { id },
    include: { applicant: { select: { id: true, name: true, location: true, affiliation: true } }, opportunity: { select: { id: true, title: true, mentorId: true } }, matches: { select: { id: true, mentorId: true, status: true } } }
  });
  if (!row) return null;
  const allowed =
    row.applicantId === viewer.id ||
    can(viewer.roles, "mentorship.coordinate") ||
    row.matches.some((m) => m.mentorId === viewer.id && ["PROPOSED", "ACTIVE", "COMPLETED", "REMATCH_REQUESTED"].includes(m.status));
  return allowed ? row : null;
}

// ── Matching (coordinator) ──

export async function proposeMatch(coordinator: Viewer, applicationId: string, opportunityId: string, note: string): Promise<Outcome> {
  if (!can(coordinator.roles, "mentorship.coordinate")) return fail("Not permitted.");
  const [application, opportunity] = await Promise.all([
    prisma.mentorshipApplication.findUnique({ where: { id: applicationId } }),
    prisma.opportunity.findUnique({ where: { id: opportunityId } })
  ]);
  if (!application || !["SUBMITTED", "REVIEWING"].includes(application.status)) return fail("Only a submitted application that has no open offer can be matched.");
  if (!opportunity || opportunity.status !== "PUBLISHED" || opportunity.filled >= opportunity.capacity) return fail("That opportunity has no places left.");
  if (opportunity.mentorId === application.applicantId) return fail("A member can't be matched with their own opportunity.");

  const match = await prisma.$transaction(async (tx) => {
    const claimed = await tx.mentorshipApplication.updateMany({ where: { id: applicationId, status: { in: ["SUBMITTED", "REVIEWING"] } }, data: { status: "MATCH_PROPOSED" } });
    if (claimed.count === 0) return null;
    const row = await tx.match.create({
      data: {
        applicationId, opportunityId, mentorId: opportunity.mentorId, studentId: application.applicantId, coordinatorId: coordinator.id,
        coordinatorNote: note || null, expiresAt: new Date(Date.now() + MATCH_OFFER_DAYS * 24 * 60 * 60 * 1000)
      }
    });
    await audit(tx, { actorId: coordinator.id, action: "match.propose", targetType: "MATCH", targetId: row.id, reason: note || null });
    return row;
  });
  if (!match) return fail("That application was just changed by someone else. Please reload.");

  const href = `/account/matches/${match.id}`;
  for (const userId of [match.studentId, match.mentorId]) {
    await notify({ userId, type: "match", title: `A mentorship match has been proposed: ${opportunity.title}`, body: `Please review and accept or decline within ${MATCH_OFFER_DAYS} days. The placement starts only if both of you accept.`, href, email: "always", dedupeKey: `match-proposed:${match.id}:${userId}` });
  }
  return { ok: true, id: match.id };
}

/** Releases an application from a match that ended without a placement, so it can be matched again. */
async function releaseApplication(tx: Prisma.TransactionClient, applicationId: string) {
  await tx.mentorshipApplication.updateMany({ where: { id: applicationId, status: "MATCH_PROPOSED" }, data: { status: "REVIEWING" } });
}

/**
 * A student or mentor answers a proposed match. The placement becomes active only when both
 * have accepted, and only if the opportunity still has a free place: the place is taken with a
 * single conditional UPDATE, so two matches accepted at the same moment can't both get the last one.
 */
export async function respondToMatch(viewer: Viewer, matchId: string, accept: boolean): Promise<Outcome & { activated?: boolean }> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { opportunity: { select: { title: true } } } });
  if (!match) return fail("Match not found.");
  const side = match.studentId === viewer.id ? "student" : match.mentorId === viewer.id ? "mentor" : null;
  if (!side) return fail("This match isn't yours to answer.");
  if (match.status !== "PROPOSED") return fail("This match is no longer awaiting an answer.");
  const other = side === "student" ? match.mentorId : match.studentId;
  const href = `/account/matches/${match.id}`;

  if (match.expiresAt < new Date()) {
    await prisma.$transaction(async (tx) => {
      await tx.match.updateMany({ where: { id: matchId, status: "PROPOSED" }, data: { status: "EXPIRED", closedAt: new Date() } });
      await releaseApplication(tx, match.applicationId);
    });
    return fail("This offer has expired. The coordinator can propose another match.");
  }

  if (!accept) {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.match.updateMany({ where: { id: matchId, status: "PROPOSED" }, data: { status: "DECLINED", closedAt: new Date() } });
      if (changed.count) {
        await releaseApplication(tx, match.applicationId);
        await audit(tx, { actorId: viewer.id, action: "match.decline", targetType: "MATCH", targetId: matchId });
      }
    });
    for (const userId of [other, match.coordinatorId]) await notify({ userId, type: "match", title: `A proposed match was declined: ${match.opportunity.title}`, href: userId === other ? href : "/admin/mentorship", email: "always" });
    return { ok: true };
  }

  const activated = await prisma.$transaction(async (tx) => {
    await tx.match.updateMany({ where: { id: matchId, status: "PROPOSED" }, data: side === "student" ? { studentAcceptedAt: new Date() } : { mentorAcceptedAt: new Date() } });
    // Lock the row so the other party's acceptance, arriving at the same moment, waits for this one.
    const rows = await tx.$queryRaw<{ studentAcceptedAt: Date | null; mentorAcceptedAt: Date | null; status: string }[]>`SELECT "studentAcceptedAt", "mentorAcceptedAt", "status"::text FROM "Match" WHERE "id" = ${matchId} FOR UPDATE`;
    const current = rows[0];
    if (!current || current.status !== "PROPOSED" || !current.studentAcceptedAt || !current.mentorAcceptedAt) return false;

    // A withdrawn application can never be activated.
    const claimed = await tx.mentorshipApplication.updateMany({ where: { id: match.applicationId, status: "MATCH_PROPOSED" }, data: { status: "ACTIVE" } });
    if (claimed.count === 0) throw new Error("APPLICATION_UNAVAILABLE");
    // Take a place only if one is free.
    const seats = await tx.$executeRaw`UPDATE "Opportunity" SET "filled" = "filled" + 1 WHERE "id" = ${match.opportunityId} AND "filled" < "capacity"`;
    if (seats === 0) throw new Error("NO_CAPACITY");
    await tx.opportunity.updateMany({ where: { id: match.opportunityId, filled: { gte: (await tx.opportunity.findUniqueOrThrow({ where: { id: match.opportunityId }, select: { capacity: true } })).capacity } }, data: { status: "CLOSED" } });
    await tx.match.update({ where: { id: matchId }, data: { status: "ACTIVE" } });
    await audit(tx, { actorId: viewer.id, action: "match.activate", targetType: "MATCH", targetId: matchId });
    return true;
  }).catch(async (err: Error) => {
    if (err.message !== "NO_CAPACITY" && err.message !== "APPLICATION_UNAVAILABLE") throw err;
    // The transaction rolled back (including this acceptance). Close the offer and say why.
    await prisma.$transaction(async (tx) => {
      await tx.match.updateMany({ where: { id: matchId, status: "PROPOSED" }, data: { status: "CLOSED", closedAt: new Date() } });
      await releaseApplication(tx, match.applicationId);
    });
    return err.message;
  });

  if (activated === "NO_CAPACITY") return fail("This opportunity filled up before both of you accepted. The coordinator will look for another match.");
  if (activated === "APPLICATION_UNAVAILABLE") return fail("This application was withdrawn, so the placement can't start.");

  if (activated === true) {
    for (const userId of [match.studentId, match.mentorId]) await notify({ userId, type: "match", title: `Your placement is active: ${match.opportunity.title}`, body: "Both of you accepted. Agree the project brief, meeting rhythm and milestones in your workspace.", href, email: "always", dedupeKey: `match-active:${match.id}:${userId}` });
    return { ok: true, activated: true };
  }
  await notify({ userId: other, type: "match", title: `${viewer.name} accepted the proposed match: ${match.opportunity.title}`, body: "The placement starts once you accept too.", href, email: "always" });
  return { ok: true, activated: false };
}

// ── Workspace ──

const matchInclude = {
  opportunity: { select: { id: true, title: true, fundingStatus: true, fundingNote: true } },
  mentor: { select: { id: true, name: true } },
  student: { select: { id: true, name: true } },
  application: { select: { id: true } },
  milestones: { orderBy: { createdAt: "asc" as const } },
  updates: { orderBy: { createdAt: "asc" as const }, include: { author: { select: { name: true } } } }
} satisfies Prisma.MatchInclude;

/** A match and its private workspace: only the two people in it and coordinators. */
export async function getMatchForViewer(id: string, viewer: Viewer) {
  const row = await prisma.match.findUnique({ where: { id }, include: matchInclude });
  if (!row) return null;
  const role = row.studentId === viewer.id ? "student" : row.mentorId === viewer.id ? "mentor" : can(viewer.roles, "mentorship.coordinate") ? "coordinator" : null;
  return role ? { match: row, role: role as "student" | "mentor" | "coordinator" } : null;
}

async function participant(viewer: Viewer, matchId: string, statuses: string[]) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || !statuses.includes(match.status)) return null;
  const side = match.studentId === viewer.id ? "student" : match.mentorId === viewer.id ? "mentor" : null;
  return side ? { match, side } : null;
}

export async function updateBrief(viewer: Viewer, matchId: string, brief: { brief: string; supervisor: string; resources: string; meetingCadence: string; expectedOutput: string }): Promise<Outcome> {
  const found = await participant(viewer, matchId, ["ACTIVE"]);
  if (!found) return fail("Only the people in an active placement can edit its brief.");
  await prisma.match.update({ where: { id: matchId }, data: brief });
  const other = found.side === "student" ? found.match.mentorId : found.match.studentId;
  await notify({ userId: other, type: "match", title: `${viewer.name} updated your project brief`, href: `/account/matches/${matchId}`, email: "updates" });
  return { ok: true };
}

export async function addMilestone(viewer: Viewer, matchId: string, title: string, dueDate: Date | null): Promise<Outcome> {
  if (!(await participant(viewer, matchId, ["ACTIVE"]))) return fail("Only the people in an active placement can add milestones.");
  await prisma.milestone.create({ data: { matchId, title, dueDate } });
  return { ok: true };
}

export async function toggleMilestone(viewer: Viewer, milestoneId: string): Promise<Outcome> {
  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
  if (!milestone || !(await participant(viewer, milestone.matchId, ["ACTIVE"]))) return fail("Milestone not found.");
  await prisma.milestone.update({ where: { id: milestoneId }, data: { doneAt: milestone.doneAt ? null : new Date() } });
  return { ok: true, id: milestone.matchId };
}

export async function addMatchUpdate(viewer: Viewer, matchId: string, body: string): Promise<Outcome> {
  const found = await participant(viewer, matchId, ["ACTIVE", "REMATCH_REQUESTED"]);
  if (!found) return fail("Only the people in this placement can post updates.");
  await prisma.matchUpdate.create({ data: { matchId, authorId: viewer.id, body } });
  const other = found.side === "student" ? found.match.mentorId : found.match.studentId;
  await notify({ userId: other, type: "match", title: `${viewer.name} posted a progress update`, body: body.slice(0, 240), href: `/account/matches/${matchId}`, email: "updates" });
  return { ok: true };
}

export async function requestRematch(viewer: Viewer, matchId: string, reason: string): Promise<Outcome> {
  const found = await participant(viewer, matchId, ["ACTIVE"]);
  if (!found) return fail("Only the people in an active placement can ask for a rematch.");
  await prisma.$transaction(async (tx) => {
    await tx.match.update({ where: { id: matchId }, data: { status: "REMATCH_REQUESTED", rematchReason: reason } });
    await audit(tx, { actorId: viewer.id, action: "match.rematch-request", targetType: "MATCH", targetId: matchId, reason });
  });
  await notify({ userId: found.match.coordinatorId, type: "match", title: "A rematch was requested", body: reason.slice(0, 240), href: "/admin/mentorship", email: "always" });
  return { ok: true };
}

/** The mentor records the outcome; private documents stay private afterwards. */
export async function completeMatch(viewer: Viewer, matchId: string, deliverables: string, feedback: string): Promise<Outcome> {
  const found = await participant(viewer, matchId, ["ACTIVE"]);
  if (!found || found.side !== "mentor") return fail("Only the mentor can mark a placement complete.");
  await prisma.$transaction(async (tx) => {
    await tx.match.update({ where: { id: matchId }, data: { status: "COMPLETED", deliverables, feedback: feedback || null, closedAt: new Date() } });
    await tx.mentorshipApplication.update({ where: { id: found.match.applicationId }, data: { status: "COMPLETED" } });
    await audit(tx, { actorId: viewer.id, action: "match.complete", targetType: "MATCH", targetId: matchId });
  });
  await notify({ userId: found.match.studentId, type: "match", title: "Your placement was marked complete", body: "Congratulations. If you'd like to share the work publicly, post a summary in Exhibitions; it goes through the usual review.", href: `/account/matches/${matchId}`, email: "always" });
  return { ok: true };
}

/** Coordinator resolves a rematch request (or closes a placement): frees the place and the application. */
export async function closeMatch(coordinator: Viewer, matchId: string, reason: string, reassign: boolean): Promise<Outcome> {
  if (!can(coordinator.roles, "mentorship.coordinate")) return fail("Not permitted.");
  if (reason.trim().length < 5) return fail("Please give a reason. It is recorded.");
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || !["ACTIVE", "REMATCH_REQUESTED", "PROPOSED"].includes(match.status)) return fail("That match is already closed.");
  const heldSeat = match.status !== "PROPOSED";
  await prisma.$transaction(async (tx) => {
    const changed = await tx.match.updateMany({ where: { id: matchId, status: match.status }, data: { status: "CLOSED", closedAt: new Date() } });
    if (changed.count === 0) return;
    if (heldSeat) {
      await tx.$executeRaw`UPDATE "Opportunity" SET "filled" = GREATEST("filled" - 1, 0) WHERE "id" = ${match.opportunityId}`;
    }
    await tx.mentorshipApplication.update({ where: { id: match.applicationId }, data: { status: reassign ? "REVIEWING" : "CLOSED" } });
    await audit(tx, { actorId: coordinator.id, action: "match.close", targetType: "MATCH", targetId: matchId, reason });
  });
  for (const userId of [match.studentId, match.mentorId]) await notify({ userId, type: "match", title: "Your mentorship match was closed by the coordinator", body: `Note: ${reason.trim()}`, href: "/account/workspace", email: "always" });
  return { ok: true };
}

// ── Staff review ──

export async function reviewMentor(coordinator: Viewer, profileId: string, decision: "VERIFIED" | "REJECTED" | "SUSPENDED", reason: string): Promise<Outcome> {
  if (!can(coordinator.roles, "mentorship.coordinate")) return fail("Not permitted.");
  if (decision !== "VERIFIED" && reason.trim().length < 5) return fail("Please give a reason. It is recorded and shared with the applicant.");
  const profile = await prisma.mentorProfile.findUnique({ where: { id: profileId } });
  if (!profile) return fail("Mentor application not found.");
  await prisma.$transaction(async (tx) => {
    await tx.mentorProfile.update({ where: { id: profileId }, data: { status: decision, reviewNote: reason.trim() || null, verifiedById: coordinator.id, verifiedAt: decision === "VERIFIED" ? new Date() : null } });
    await audit(tx, { actorId: coordinator.id, action: `mentor.${decision.toLowerCase()}`, targetType: "MENTOR_PROFILE", targetId: profileId, reason: reason || null });
  });
  await notify({
    userId: profile.userId, type: "match", email: "always", href: "/mentorship/mentor",
    title: decision === "VERIFIED" ? "You're now a verified NBM mentor" : decision === "REJECTED" ? "Your mentor application wasn't approved" : "Your mentor status was suspended",
    body: decision === "VERIFIED" ? "You can now post research and innovation opportunities." : `Note: ${reason.trim()}`
  });
  return { ok: true };
}

export async function reviewOpportunity(coordinator: Viewer, id: string, decision: "PUBLISHED" | "REJECTED" | "CLOSED", reason: string): Promise<Outcome> {
  if (!can(coordinator.roles, "mentorship.coordinate")) return fail("Not permitted.");
  if (decision !== "PUBLISHED" && reason.trim().length < 5) return fail("Please give a reason. It is recorded.");
  const row = await prisma.opportunity.findUnique({ where: { id } });
  if (!row) return fail("Opportunity not found.");
  if (decision === "PUBLISHED" && row.filled >= row.capacity) return fail("This opportunity has no free places, so it can't be published.");
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({ where: { id }, data: { status: decision, reviewNote: reason.trim() || null } });
    await audit(tx, { actorId: coordinator.id, action: `opportunity.${decision.toLowerCase()}`, targetType: "OPPORTUNITY", targetId: id, reason: reason || null });
  });
  await notify({ userId: row.mentorId, type: "match", email: "always", href: `/mentorship/opportunities/${id}`, title: decision === "PUBLISHED" ? `Your opportunity "${row.title}" is published` : `Your opportunity "${row.title}" was ${decision === "REJECTED" ? "not approved" : "closed"}`, body: reason ? `Note: ${reason.trim()}` : undefined });
  return { ok: true };
}
