"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FUNDING_STATUS, TOPICS } from "@/lib/constants";
import { failure, success, text, zodFailure, type FormState } from "@/lib/forms";
import {
  addMatchUpdate, addMilestone, closeMatch, closeOwnOpportunity, completeMatch, createOpportunity, proposeMatch, requestRematch,
  respondToMatch, reviewMentor, reviewOpportunity, saveApplication, toggleMilestone, updateBrief, withdrawApplication
} from "@/lib/mentorship";
import { prisma } from "@/lib/prisma";
import { consume } from "@/lib/rate-limit";
import { getViewer } from "@/lib/viewer";

const HOUR = 60 * 60 * 1000;
const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12);
const modes = z.enum(["REMOTE", "LOCAL", "HYBRID"], { errorMap: () => ({ message: "Please choose how you would work." }) });
const long = (min: number, message: string, max = 3000) => z.string().trim().min(min, message).max(max);

async function member(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) return { viewer: null, state: failure(formData, "Please sign in first.") };
  if (!viewer.emailVerified) return { viewer: null, state: failure(formData, "Please confirm your email address first. You can request a new link from your account settings.") };
  return { viewer, state: null };
}

const mentorSchema = z.object({
  kind: z.enum(["RESEARCH_PI", "TECHNICAL_MENTOR"], { errorMap: () => ({ message: "Please choose the role that describes you." }) }),
  expertise: z.string().trim().min(3, "List at least one area of expertise.").max(400),
  affiliation: z.string().trim().min(2, "Tell us where you work or study.").max(200),
  projectInterests: long(20, "Describe the kind of projects you'd like to support."),
  availability: z.string().trim().min(3, "Tell us roughly how much time you can give.").max(300),
  location: z.string().trim().min(2, "Where are you based?").max(120),
  workingMode: modes,
  capacity: z.coerce.number().int().min(1, "At least 1.").max(10, "At most 10 for the pilot.")
});

export async function mentorApplyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  if (consume(`mentor-apply:${viewer.id}`, 5, HOUR).limited) return failure(formData, "Please wait before sending this again.");
  const parsed = mentorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodFailure(formData, parsed.error);
  const data = { ...parsed.data, expertise: list(parsed.data.expertise) };
  const existing = await prisma.mentorProfile.findUnique({ where: { userId: viewer.id }, select: { status: true } });
  if (existing?.status === "SUSPENDED") return failure(formData, "Your mentor status is suspended. Please contact us.");
  // Changing the details of a verified profile sends it back for verification.
  await prisma.mentorProfile.upsert({ where: { userId: viewer.id }, update: { ...data, status: "PENDING", reviewNote: null, verifiedAt: null }, create: { ...data, userId: viewer.id } });
  revalidatePath("/mentorship/mentor");
  return success("Thank you. A coordinator will review your details before you appear as a verified mentor. This is a review, not an automatic approval.");
}

const opportunitySchema = z.object({
  title: z.string().trim().min(5, "Give the opportunity a clear title.").max(140),
  topic: z.enum(TOPICS, { errorMap: () => ({ message: "Please choose a topic." }) }),
  scope: long(40, "Describe the project scope in a few sentences."),
  skills: z.string().trim().min(2, "List the skills a student needs or will use.").max(400),
  learningGoals: long(20, "Say what a student should learn."),
  duration: z.string().trim().min(2, "e.g. 12 weeks").max(80),
  hoursPerWeek: z.string().trim().min(1, "e.g. 6-8 hours").max(80),
  location: z.string().trim().min(2, "Where is the work based?").max(120),
  workingMode: modes,
  facilities: z.string().trim().max(600).optional(),
  fundingStatus: z.string().refine((value) => value in FUNDING_STATUS, "Please state the funding position honestly."),
  fundingNote: z.string().trim().max(400).optional(),
  capacity: z.coerce.number().int().min(1, "At least 1 place.").max(10, "At most 10 for the pilot.")
});

export async function createOpportunityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  const parsed = opportunitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodFailure(formData, parsed.error);
  const d = parsed.data;
  const result = await createOpportunity(viewer, { ...d, skills: list(d.skills), facilities: d.facilities || null, fundingNote: d.fundingNote || null });
  if (!result.ok) return failure(formData, result.error);
  revalidatePath("/mentorship/mentor");
  return success("Saved. If it needs review, a coordinator will check it before it is published.");
}

export async function closeOpportunityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  const result = await closeOwnOpportunity(viewer, text(formData, "id"));
  if (!result.ok) return failure(formData, result.error);
  revalidatePath("/mentorship/mentor");
  return success("Closed. It no longer accepts applications.");
}

const applicationSchema = z.object({
  interests: long(20, "Tell us what you're interested in (at least 20 characters)."),
  experience: long(20, "Describe relevant experience, coursework or projects. Informal work counts."),
  motivation: long(20, "Say why you want this."),
  goals: long(10, "What do you hope to learn or produce?"),
  availability: z.string().trim().min(3, "Roughly how many hours a week, and for how long?").max(300),
  location: z.string().trim().min(2, "Where are you based?").max(120)
});

export async function saveApplicationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  if (consume(`mentorship-apply:${viewer.id}`, 20, HOUR).limited) return failure(formData, "Please wait before trying again.");
  const submit = text(formData, "intent") !== "draft";
  const raw = Object.fromEntries(formData);
  const parsed = submit ? applicationSchema.safeParse(raw) : applicationSchema.partial().safeParse(raw);
  if (!parsed.success) return zodFailure(formData, parsed.error);
  const d = parsed.data;
  const result = await saveApplication(
    viewer,
    text(formData, "applicationId") || null,
    text(formData, "opportunityId") || null,
    { interests: d.interests ?? "", experience: d.experience ?? "", motivation: d.motivation ?? "", goals: d.goals ?? "", availability: d.availability ?? "", location: d.location ?? "", documentUploadId: text(formData, "documentUploadId") || null },
    submit
  );
  if (!result.ok) return failure(formData, result.error);
  if (submit) redirect("/account/workspace?applied=1");
  redirect(`/mentorship/apply?application=${result.id}&saved=1`);
}

export async function withdrawApplicationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  const result = await withdrawApplication(viewer, text(formData, "id"));
  if (!result.ok) return failure(formData, result.error);
  revalidatePath("/account/workspace");
  return success("Withdrawn.");
}

export async function respondMatchAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  const id = text(formData, "matchId");
  const accept = text(formData, "answer") === "accept";
  const result = await respondToMatch(viewer, id, accept);
  revalidatePath(`/account/matches/${id}`);
  if (!result.ok) return failure(formData, result.error);
  return success(!accept ? "You declined this match." : result.activated ? "Both of you have accepted. The placement is now active." : "Accepted. The placement starts once the other person accepts too.");
}

export async function briefAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  const id = text(formData, "matchId");
  const field = (key: string) => text(formData, key).slice(0, 3000);
  const result = await updateBrief(viewer, id, { brief: field("brief"), supervisor: field("supervisor"), resources: field("resources"), meetingCadence: field("meetingCadence"), expectedOutput: field("expectedOutput") });
  if (!result.ok) return failure(formData, result.error);
  revalidatePath(`/account/matches/${id}`);
  return success("Brief saved.");
}

export async function milestoneAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  const toggleId = text(formData, "milestoneId");
  const matchId = text(formData, "matchId");
  if (toggleId) {
    const result = await toggleMilestone(viewer, toggleId);
    if (!result.ok) return failure(formData, result.error);
  } else {
    const title = text(formData, "title");
    if (title.length < 3 || title.length > 200) return failure(formData, "Give the milestone a short title.");
    const due = text(formData, "dueDate");
    const result = await addMilestone(viewer, matchId, title, due ? new Date(due) : null);
    if (!result.ok) return failure(formData, result.error);
  }
  revalidatePath(`/account/matches/${matchId}`);
  return success("Saved.");
}

export async function matchUpdateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  const id = text(formData, "matchId");
  const body = text(formData, "body");
  if (body.length < 3 || body.length > 4000) return failure(formData, "Write a short update (up to 4,000 characters).");
  const result = await addMatchUpdate(viewer, id, body);
  if (!result.ok) return failure(formData, result.error);
  revalidatePath(`/account/matches/${id}`);
  return success("Update posted.");
}

export async function rematchAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  const id = text(formData, "matchId");
  const reason = text(formData, "reason");
  if (reason.length < 10) return failure(formData, "Please tell the coordinator what isn't working. Only they will see this.");
  const result = await requestRematch(viewer, id, reason.slice(0, 2000));
  if (!result.ok) return failure(formData, result.error);
  revalidatePath(`/account/matches/${id}`);
  return success("The coordinator has been told and will be in touch.");
}

export async function completeMatchAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  const id = text(formData, "matchId");
  const deliverables = text(formData, "deliverables");
  if (deliverables.length < 10) return failure(formData, "Record what was delivered, including findings that didn't work out.");
  const result = await completeMatch(viewer, id, deliverables.slice(0, 4000), text(formData, "feedback").slice(0, 4000));
  if (!result.ok) return failure(formData, result.error);
  revalidatePath(`/account/matches/${id}`);
  return success("Marked complete.");
}

// ── Coordinator actions. Each lib function re-checks the mentorship.coordinate capability. ──

async function staff(formData: FormData) {
  const viewer = await getViewer();
  return viewer ? { viewer, state: null } : { viewer: null, state: failure(formData, "Please sign in first.") };
}

export async function reviewMentorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await staff(formData);
  if (!viewer) return state;
  const decision = text(formData, "decision");
  if (decision !== "VERIFIED" && decision !== "REJECTED" && decision !== "SUSPENDED") return failure(formData, "Unknown decision.");
  const result = await reviewMentor(viewer, text(formData, "id"), decision, text(formData, "reason"));
  if (!result.ok) return failure(formData, result.error);
  revalidatePath("/admin/mentorship");
  return success("Saved.");
}

export async function reviewOpportunityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await staff(formData);
  if (!viewer) return state;
  const decision = text(formData, "decision");
  if (decision !== "PUBLISHED" && decision !== "REJECTED" && decision !== "CLOSED") return failure(formData, "Unknown decision.");
  const result = await reviewOpportunity(viewer, text(formData, "id"), decision, text(formData, "reason"));
  if (!result.ok) return failure(formData, result.error);
  revalidatePath("/admin/mentorship");
  return success("Saved.");
}

export async function proposeMatchAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await staff(formData);
  if (!viewer) return state;
  const opportunityId = text(formData, "opportunityId");
  if (!opportunityId) return failure(formData, "Choose an opportunity to match with.");
  const result = await proposeMatch(viewer, text(formData, "applicationId"), opportunityId, text(formData, "note").slice(0, 1000));
  if (!result.ok) return failure(formData, result.error);
  revalidatePath("/admin/mentorship");
  return success("Match proposed. Both people have been notified and must accept.");
}

export async function closeMatchAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await staff(formData);
  if (!viewer) return state;
  const result = await closeMatch(viewer, text(formData, "matchId"), text(formData, "reason"), text(formData, "reassign") === "on");
  if (!result.ok) return failure(formData, result.error);
  revalidatePath("/admin/mentorship");
  return success("Match closed and the place released.");
}
