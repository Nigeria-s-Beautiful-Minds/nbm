// Sponsorship campaigns: support requests, staff review, milestones, updates and disbursements.
// Money itself is handled in lib/payments.ts; this file never marks anything as paid.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, notify } from "@/lib/audit";
import { slugify } from "@/lib/constants";
import { campaignTotals } from "@/lib/payments";
import { can } from "@/lib/permissions";
import { randomToken } from "@/lib/tokens";
import type { Viewer } from "@/lib/viewer";

type Outcome = { ok: true; id?: string } | { ok: false; error: string };
const fail = (error: string): Outcome => ({ ok: false, error });

export async function listOpenCampaigns() {
  try {
    const rows = await prisma.campaign.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 60 });
    return Promise.all(rows.map(async (row) => ({ ...row, targetMinor: Number(row.targetMinor), totals: await campaignTotals(row.id) })));
  } catch (err) {
    console.error("listOpenCampaigns failed:", err);
    return [];
  }
}

const campaignInclude = {
  requester: { select: { name: true } },
  milestones: { orderBy: { sortOrder: "asc" as const } },
  updates: { orderBy: { createdAt: "desc" as const } }
} satisfies Prisma.CampaignInclude;

/** Open and closed campaigns are public. Requests still under review are visible only to the requester and finance staff. */
export async function getCampaign(slugOrId: string, viewer: Viewer | null) {
  const row = await prisma.campaign.findFirst({ where: { OR: [{ slug: slugOrId }, { id: slugOrId }] }, include: campaignInclude });
  if (!row) return null;
  const isPublic = row.status === "OPEN" || row.status === "CLOSED";
  const isOwn = row.requesterId === viewer?.id;
  if (!isPublic && !isOwn && !can(viewer?.roles, "finance.manage")) return null;
  // Donor names appear only where the donor opted in; everyone else is counted but not named.
  const supporters = isPublic ? await prisma.contribution.findMany({ where: { campaignId: row.id, status: "SUCCEEDED", showPublicly: true, donorName: { not: null } }, orderBy: { createdAt: "desc" }, take: 30, select: { donorName: true } }) : [];
  return { campaign: row, isOwn, isPublic, totals: await campaignTotals(row.id), supporters: supporters.map((s) => s.donorName!) };
}

export type CampaignInput = {
  title: string; kind: string; purpose: string; team: string; beneficiaries: string; budget: string; currency: string; targetMinor: number; deadline: Date | null;
  milestones: { title: string; amountMinor: number }[];
};

export async function submitCampaignRequest(viewer: Viewer, input: CampaignInput): Promise<Outcome> {
  const row = await prisma.campaign.create({
    data: {
      slug: `${slugify(input.title)}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "x")}`,
      requesterId: viewer.id, title: input.title, kind: input.kind, purpose: input.purpose, team: input.team, beneficiaries: input.beneficiaries,
      budget: input.budget, currency: input.currency, targetMinor: BigInt(input.targetMinor), deadline: input.deadline,
      milestones: { create: input.milestones.map((m, index) => ({ title: m.title, amountMinor: BigInt(m.amountMinor), sortOrder: index })) }
    }
  });
  return { ok: true, id: row.id };
}

export type CampaignDecision = "REVIEWING" | "OPEN" | "REJECTED" | "CLOSED";

/** Finance staff move a request through review. Opening requires a recorded policy for a missed or exceeded target. */
export async function reviewCampaign(staff: Viewer, id: string, decision: CampaignDecision, reason: string, targetPolicy: string): Promise<Outcome> {
  if (!can(staff.roles, "finance.manage")) return fail("Not permitted.");
  const row = await prisma.campaign.findUnique({ where: { id } });
  if (!row) return fail("Campaign not found.");
  if ((decision === "REJECTED" || decision === "CLOSED") && reason.trim().length < 5) return fail("Please give a reason. It is recorded and shared with the requester.");
  if (decision === "OPEN" && (row.targetPolicy ?? targetPolicy).trim().length < 20) return fail("Before opening contributions, record what happens if the target is missed or exceeded.");
  const allowed: Record<CampaignDecision, string[]> = { REVIEWING: ["SUBMITTED"], OPEN: ["SUBMITTED", "REVIEWING", "APPROVED", "CLOSED"], REJECTED: ["SUBMITTED", "REVIEWING"], CLOSED: ["OPEN"] };
  if (!allowed[decision].includes(row.status)) return fail(`A ${row.status.toLowerCase()} campaign can't be moved to ${decision.toLowerCase()}.`);

  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({ where: { id }, data: { status: decision, reviewedById: staff.id, reviewNote: reason.trim() || row.reviewNote, ...(targetPolicy.trim() ? { targetPolicy: targetPolicy.trim() } : {}) } });
    await audit(tx, { actorId: staff.id, action: `campaign.${decision.toLowerCase()}`, targetType: "CAMPAIGN", targetId: id, reason: reason || null });
  });
  if (decision !== "REVIEWING") {
    await notify({
      userId: row.requesterId, type: "sponsorship", email: "always", href: decision === "OPEN" ? `/sponsorship/${row.slug}` : "/account/workspace",
      title: decision === "OPEN" ? `Your campaign "${row.title}" is approved and open` : decision === "REJECTED" ? `Your support request "${row.title}" wasn't approved` : `Your campaign "${row.title}" was closed`,
      body: reason ? `Note: ${reason.trim()}` : undefined
    });
  }
  return { ok: true };
}

/** The requester posts progress updates on their own public campaign. */
export async function addCampaignUpdate(viewer: Viewer, campaignId: string, body: string): Promise<Outcome> {
  const row = await prisma.campaign.findFirst({ where: { id: campaignId, status: { in: ["OPEN", "CLOSED"] } }, select: { requesterId: true } });
  if (!row || (row.requesterId !== viewer.id && !can(viewer.roles, "finance.manage"))) return fail("Only the campaign's team can post updates.");
  await prisma.campaignUpdate.create({ data: { campaignId, authorId: viewer.id, body } });
  return { ok: true };
}

/** The requester submits evidence for a milestone. This alone releases nothing: finance must review it. */
export async function submitMilestoneEvidence(viewer: Viewer, milestoneId: string, evidence: string): Promise<Outcome> {
  const milestone = await prisma.campaignMilestone.findUnique({ where: { id: milestoneId }, include: { campaign: { select: { requesterId: true, id: true } } } });
  if (!milestone || milestone.campaign.requesterId !== viewer.id) return fail("Milestone not found.");
  if (milestone.status === "APPROVED") return fail("This milestone has already been approved.");
  await prisma.campaignMilestone.update({ where: { id: milestoneId }, data: { evidence, status: "EVIDENCE_SUBMITTED" } });
  return { ok: true, id: milestone.campaign.id };
}

export async function approveMilestone(staff: Viewer, milestoneId: string): Promise<Outcome> {
  if (!can(staff.roles, "finance.manage")) return fail("Not permitted.");
  const milestone = await prisma.campaignMilestone.findUnique({ where: { id: milestoneId } });
  if (!milestone || milestone.status !== "EVIDENCE_SUBMITTED") return fail("There is no evidence awaiting review for this milestone.");
  await prisma.$transaction(async (tx) => {
    await tx.campaignMilestone.update({ where: { id: milestoneId }, data: { status: "APPROVED", reviewedById: staff.id } });
    await audit(tx, { actorId: staff.id, action: "milestone.approve", targetType: "CAMPAIGN_MILESTONE", targetId: milestoneId });
  });
  return { ok: true };
}

/**
 * Finance staff record money released to a campaign. It is a record of a transfer made outside
 * the site, never an automatic payout, and it can't exceed what has actually been received.
 */
export async function recordDisbursement(staff: Viewer, campaignId: string, milestoneId: string | null, amountMinor: number, note: string): Promise<Outcome> {
  if (!can(staff.roles, "finance.manage")) return fail("Not permitted.");
  if (note.trim().length < 5) return fail("Please add a note explaining this release. It is recorded.");
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return fail("Enter an amount greater than zero.");
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currency: true } });
  if (!campaign) return fail("Campaign not found.");
  if (milestoneId) {
    const milestone = await prisma.campaignMilestone.findFirst({ where: { id: milestoneId, campaignId } });
    if (!milestone || milestone.status !== "APPROVED") return fail("Money can be released against a milestone only after its evidence has been approved.");
  }
  const totals = await campaignTotals(campaignId);
  if (totals.disbursedMinor + amountMinor > totals.receivedMinor) return fail("That is more than this campaign has received and not yet released.");
  await prisma.$transaction(async (tx) => {
    const row = await tx.disbursement.create({ data: { campaignId, milestoneId, amountMinor: BigInt(amountMinor), currency: campaign.currency, note: note.trim(), recordedById: staff.id } });
    await audit(tx, { actorId: staff.id, action: "disbursement.record", targetType: "CAMPAIGN", targetId: campaignId, reason: note, metadata: { disbursementId: row.id, amountMinor, currency: campaign.currency } });
  });
  return { ok: true };
}
