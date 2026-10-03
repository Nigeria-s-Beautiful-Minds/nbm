"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MEMBER_TYPES } from "@/lib/constants";
import { failure, success, type FormState } from "@/lib/forms";
import { prisma } from "@/lib/prisma";
import { consume } from "@/lib/rate-limit";
import { getViewer } from "@/lib/viewer";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(100),
  headline: z.string().trim().max(140).optional(),
  bio: z.string().trim().max(1500).optional(),
  location: z.string().trim().max(100).optional(),
  affiliation: z.string().trim().max(160).optional(),
  memberType: z.enum(MEMBER_TYPES).optional().or(z.literal("")),
  interests: z.string().trim().max(400).optional(),
  phone: z.string().trim().max(40).optional()
});

// Always updates the signed-in account: there is no id in the form to tamper with.
export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return failure(formData, "Please sign in first.");
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");
  const d = parsed.data;
  await prisma.user.update({
    where: { id: viewer.id },
    data: {
      name: d.name, headline: d.headline || null, bio: d.bio || null, location: d.location || null, affiliation: d.affiliation || null,
      memberType: d.memberType || null, phone: d.phone || null,
      interests: (d.interests ?? "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12)
    }
  });
  revalidatePath("/account/profile");
  return success("Profile saved.");
}

export async function updateSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return failure(formData, "Please sign in first.");
  await prisma.user.update({ where: { id: viewer.id }, data: { emailOnReplies: formData.get("emailOnReplies") === "on", emailOnUpdates: formData.get("emailOnUpdates") === "on" } });
  revalidatePath("/account/settings");
  return success("Notification settings saved.");
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return failure(formData, "Please sign in first.");
  if (consume(`password:${viewer.id}`, 5, 60 * 60 * 1000).limited) return failure(formData, "Too many attempts. Please try again later.");
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("password") ?? "");
  if (next.length < 10 || next.length > 128) return failure(formData, "Use at least 10 characters for your new password.");
  if (next !== String(formData.get("confirmPassword") ?? "")) return failure(formData, "The two new passwords don't match.");
  const user = await prisma.user.findUnique({ where: { id: viewer.id }, select: { passwordHash: true } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) return failure(formData, "Your current password isn't right.");
  await prisma.user.update({ where: { id: viewer.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
  return success("Password changed.");
}

export async function markNotificationsReadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return failure(formData, "Please sign in first.");
  await prisma.notification.updateMany({ where: { userId: viewer.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/account/notifications");
  return success("All caught up.");
}
