"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TEXT_LIMITS, TOPICS } from "@/lib/constants";
import { createThread, setBlocked, setThreadStatus, setThreadSummary } from "@/lib/discussions";
import { failure, success, text, zodFailure, type FormState } from "@/lib/forms";
import { consume } from "@/lib/rate-limit";
import { createRoom } from "@/lib/rooms";
import { getViewer } from "@/lib/viewer";

const HOUR = 60 * 60 * 1000;

async function member(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) return { viewer: null, state: failure(formData, "Please sign in first.") };
  if (!viewer.emailVerified) return { viewer: null, state: failure(formData, "Please confirm your email address first. You can request a new link from your account settings.") };
  return { viewer, state: null };
}

const threadSchema = z.object({
  title: z.string().trim().min(5, "Give your conversation a clear title (at least 5 characters).").max(TEXT_LIMITS.title),
  topic: z.enum(TOPICS, { errorMap: () => ({ message: "Please choose a topic." }) }),
  body: z.string().trim().min(20, "Say a little more to get the conversation going (at least 20 characters).").max(TEXT_LIMITS.message),
  referenceUrl: z.string().trim().url("Links must start with http:// or https://.").max(500).optional().or(z.literal(""))
});

export async function createThreadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  if (consume(`thread:${viewer.id}`, 10, HOUR).limited) return failure(formData, "Please wait before starting another conversation.");
  const parsed = threadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodFailure(formData, parsed.error);
  const id = await createThread(viewer, { ...parsed.data, referenceUrl: parsed.data.referenceUrl || null });
  redirect(`/discussion/${id}`);
}

const roomSchema = z.object({
  title: z.string().trim().min(5, "Give your room a clear title (at least 5 characters).").max(TEXT_LIMITS.title),
  topic: z.enum(TOPICS, { errorMap: () => ({ message: "Please choose a topic." }) }),
  description: z.string().trim().min(20, "Tell people what the room is about (at least 20 characters).").max(2000),
  // The browser converts the host's local date and time to UTC before sending.
  startsAtUtc: z.string().datetime({ message: "Please choose a start date and time." }),
  timezone: z.string().trim().min(1).max(64)
});

export async function createRoomAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  if (consume(`room:${viewer.id}`, 5, HOUR).limited) return failure(formData, "Please wait before scheduling another room.");
  const parsed = roomSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodFailure(formData, parsed.error, parsed.error.issues[0]?.message);
  const startsAt = new Date(parsed.data.startsAtUtc);
  if (startsAt.getTime() < Date.now() - 10 * 60 * 1000) return failure(formData, "The start time is in the past.");
  if (startsAt.getTime() > Date.now() + 90 * 24 * HOUR) return failure(formData, "Rooms can be scheduled up to 90 days ahead.");
  const id = await createRoom(viewer, { title: parsed.data.title, topic: parsed.data.topic, description: parsed.data.description, startsAt, timezone: parsed.data.timezone });
  redirect(`/discussion/rooms/${id}`);
}

export async function threadStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  const status = text(formData, "status");
  if (status !== "OPEN" && status !== "LOCKED" && status !== "ARCHIVED") return failure(formData, "Unknown status.");
  const id = text(formData, "threadId");
  const result = await setThreadStatus(id, viewer, status, text(formData, "reason"));
  if (!result.ok) return failure(formData, result.error || "Could not update the discussion.");
  revalidatePath(`/discussion/${id}`);
  return success(status === "OPEN" ? "The discussion is open again." : status === "LOCKED" ? "Locked. No new messages can be added." : "Archived.");
}

export async function threadSummaryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  const summary = text(formData, "summary");
  if (summary.length > 4000) return failure(formData, "The summary can be up to 4,000 characters.");
  const id = text(formData, "threadId");
  if (!(await setThreadSummary(id, viewer, summary))) return failure(formData, "Only the host can add a summary.");
  revalidatePath(`/discussion/${id}`);
  return success("Summary saved.");
}

export async function blockAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, state } = await member(formData);
  if (!viewer) return state;
  const blocked = text(formData, "blocked") === "true";
  await setBlocked(viewer.id, text(formData, "userId"), blocked);
  revalidatePath(text(formData, "path") || "/discussion");
  return success(blocked ? "Blocked. They can no longer post in conversations or rooms you host, and their messages are hidden from you." : "Unblocked.");
}
