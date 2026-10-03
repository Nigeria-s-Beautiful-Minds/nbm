"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CAMPAIGN_KINDS } from "@/lib/constants";
import { failure, ipLimited, looksAutomated, success, text, zodFailure, type FormState } from "@/lib/forms";
import { PAYMENT_CURRENCY, createCheckout } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { consume, normalizeEmail } from "@/lib/rate-limit";
import { addCampaignUpdate, approveMilestone, recordDisbursement, reviewCampaign, submitCampaignRequest, submitMilestoneEvidence, type CampaignDecision } from "@/lib/sponsorship";
import { actionCapability, getViewer } from "@/lib/viewer";

const HOUR = 60 * 60 * 1000;

/** "1,500.50" → 150050 minor units. Returns NaN for anything that isn't a plain amount. */
function toMinor(value: string): number {
  const cleaned = value.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN;
  return Math.round(Number(cleaned) * 100);
}

const contributeSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address for your acknowledgement."),
  name: z.string().trim().max(120).optional()
});

// Used by both Contribute (general fund) and Sponsorship (a campaign): one contribution system.
export async function contributeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (looksAutomated(formData)) return failure(formData, "We couldn't process that. Please try again.");
  if (await ipLimited("contribute", 10, HOUR)) return failure(formData, "Too many attempts. Please try again later.");
  const parsed = contributeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodFailure(formData, parsed.error);
  const amountMinor = toMinor(text(formData, "customAmount") || text(formData, "amount"));
  if (!Number.isFinite(amountMinor)) return failure(formData, "Please choose or enter an amount.", { customAmount: "Enter a number, for example 5000." });

  const viewer = await getViewer();
  const result = await createCheckout({
    campaignId: text(formData, "campaignId") || null,
    amountMinor,
    currency: text(formData, "currency") || PAYMENT_CURRENCY,
    donorEmail: normalizeEmail(parsed.data.email),
    donorName: parsed.data.name || null,
    showPublicly: text(formData, "showPublicly") === "on" && Boolean(parsed.data.name),
    userId: viewer?.id ?? null
  });
  if (!result.ok) return failure(formData, result.error);
  // Off to the provider's hosted checkout. No card details ever touch this site.
  redirect(result.url);
}

const enquirySchema = z.object({
  kind: z.enum(["PARTNERSHIP", "IN_KIND", "PLEDGE"], { errorMap: () => ({ message: "Please choose the kind of support." }) }),
  organisation: z.string().trim().min(2, "Tell us who you represent (or write 'Individual').").max(200),
  contactName: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().email("Please enter a valid email address."),
  details: z.string().trim().min(20, "Tell us a little more about what you have in mind.").max(4000),
  estimatedValue: z.string().trim().max(200).optional()
});

export async function supportEnquiryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (looksAutomated(formData)) return failure(formData, "We couldn't process that. Please try again.");
  if (await ipLimited("enquiry", 5, HOUR)) return failure(formData, "Too many requests. Please try again later.");
  const parsed = enquirySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodFailure(formData, parsed.error);
  const campaignId = text(formData, "campaignId");
  const campaign = campaignId ? await prisma.campaign.findFirst({ where: { id: campaignId, status: "OPEN" }, select: { id: true } }) : null;
  // An enquiry is only ever an enquiry: it never touches a campaign's received total.
  await prisma.supportEnquiry.create({ data: { ...parsed.data, email: normalizeEmail(parsed.data.email), estimatedValue: parsed.data.estimatedValue || null, campaignId: campaign?.id ?? null } });
  return success("Thank you. Your enquiry has been saved and our team will review it and reply by email. Nothing is committed until we have spoken.");
}

const requestSchema = z.object({
  title: z.string().trim().min(8, "Give the request a clear title.").max(140),
  kind: z.string().refine((value) => value in CAMPAIGN_KINDS, "Please choose what the support is for."),
  purpose: z.string().trim().min(60, "Explain the problem and what the support will make possible (at least 60 characters).").max(5000),
  team: z.string().trim().min(10, "Who is doing the work?").max(2000),
  beneficiaries: z.string().trim().min(10, "Who is this intended to benefit?").max(2000),
  budget: z.string().trim().min(30, "List the main costs.").max(4000)
});

export async function campaignRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return failure(formData, "Please sign in first.");
  if (!viewer.emailVerified) return failure(formData, "Please confirm your email address first.");
  if (consume(`campaign-request:${viewer.id}`, 3, 24 * HOUR).limited) return failure(formData, "You've sent several requests recently. Please try again tomorrow.");
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodFailure(formData, parsed.error);
  const targetMinor = toMinor(text(formData, "target"));
  if (!Number.isFinite(targetMinor) || targetMinor < 100_00) return failure(formData, "Enter the funding target as a number.", { target: "For example 3000000." });
  const deadlineText = text(formData, "deadline");
  const deadline = deadlineText ? new Date(`${deadlineText}T23:59:59Z`) : null;
  if (deadline && (Number.isNaN(deadline.getTime()) || deadline < new Date())) return failure(formData, "The deadline must be in the future.", { deadline: "Choose a future date." });

  const milestones: { title: string; amountMinor: number }[] = [];
  for (const index of [1, 2, 3, 4]) {
    const title = text(formData, `milestone${index}`);
    if (!title) continue;
    const amount = toMinor(text(formData, `milestone${index}Amount`));
    if (!Number.isFinite(amount) || amount <= 0) return failure(formData, `Enter an amount for milestone ${index}.`, { [`milestone${index}Amount`]: "Enter a number." });
    milestones.push({ title: title.slice(0, 200), amountMinor: amount });
  }
  if (milestones.length === 0) return failure(formData, "Add at least one milestone, so supporters can see what their money achieves.", { milestone1: "Required." });
  if (milestones.reduce((sum, m) => sum + m.amountMinor, 0) > targetMinor) return failure(formData, "The milestone amounts add up to more than the funding target.");

  await submitCampaignRequest(viewer, { ...parsed.data, currency: PAYMENT_CURRENCY, targetMinor, deadline, milestones });
  redirect("/account/workspace?requested=1");
}

export async function campaignUpdateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.emailVerified) return failure(formData, "Please sign in first.");
  const body = text(formData, "body");
  if (body.length < 10 || body.length > 4000) return failure(formData, "Write a short update (10 to 4,000 characters).");
  const result = await addCampaignUpdate(viewer, text(formData, "campaignId"), body);
  if (!result.ok) return failure(formData, result.error);
  revalidatePath(text(formData, "path") || "/sponsorship");
  return success("Update posted.");
}

export async function milestoneEvidenceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.emailVerified) return failure(formData, "Please sign in first.");
  const evidence = text(formData, "evidence");
  if (evidence.length < 20 || evidence.length > 4000) return failure(formData, "Describe what was done and where the evidence can be seen (at least 20 characters).");
  const result = await submitMilestoneEvidence(viewer, text(formData, "milestoneId"), evidence);
  if (!result.ok) return failure(formData, result.error);
  revalidatePath(text(formData, "path") || "/sponsorship");
  return success("Submitted. Our finance team reviews the evidence before any money is released.");
}

// ── Finance staff. The lib functions re-check finance.manage; actionCapability stops everyone else first. ──

export async function reviewCampaignAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await actionCapability("finance.manage");
  const decision = text(formData, "decision") as CampaignDecision;
  if (!["REVIEWING", "OPEN", "REJECTED", "CLOSED"].includes(decision)) return failure(formData, "Unknown decision.");
  const result = await reviewCampaign(staff, text(formData, "id"), decision, text(formData, "reason"), text(formData, "targetPolicy"));
  if (!result.ok) return failure(formData, result.error);
  revalidatePath("/admin/sponsorship");
  return success("Saved.");
}

export async function approveMilestoneAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await actionCapability("finance.manage");
  const result = await approveMilestone(staff, text(formData, "milestoneId"));
  if (!result.ok) return failure(formData, result.error);
  revalidatePath("/admin/sponsorship");
  return success("Milestone evidence approved.");
}

export async function disbursementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await actionCapability("finance.manage");
  const amountMinor = toMinor(text(formData, "amount"));
  if (!Number.isFinite(amountMinor)) return failure(formData, "Enter the amount as a number.");
  const result = await recordDisbursement(staff, text(formData, "campaignId"), text(formData, "milestoneId") || null, amountMinor, text(formData, "note"));
  if (!result.ok) return failure(formData, result.error);
  revalidatePath("/admin/sponsorship");
  return success("Disbursement recorded.");
}

export async function enquiryStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await actionCapability("finance.manage");
  const status = text(formData, "status");
  if (!["NEW", "REVIEWING", "ACCEPTED", "DECLINED"].includes(status)) return failure(formData, "Unknown status.");
  await prisma.supportEnquiry.update({ where: { id: text(formData, "id") }, data: { status: status as "NEW", notes: text(formData, "notes").slice(0, 2000) || null, assigneeId: staff.id } });
  revalidatePath("/admin/sponsorship");
  return success("Saved.");
}
