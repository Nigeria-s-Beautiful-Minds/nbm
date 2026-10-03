"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { baseUrl } from "@/lib/config";
import { MEMBER_TYPES } from "@/lib/constants";
import { failure, ipLimited, looksAutomated, success, text, zodFailure, type FormState } from "@/lib/forms";
import { sendVerificationEmail } from "@/lib/account-email";
import { renderEmail, sendEmail } from "@/lib/mailer";
import { currentPolicyVersion } from "@/lib/pages";
import { consume, normalizeEmail } from "@/lib/rate-limit";
import { consumeAuthToken, issueAuthToken } from "@/lib/tokens";
import { getViewer } from "@/lib/viewer";

const HOUR = 60 * 60 * 1000;

const joinSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(100),
  email: z.string().trim().email("Please enter a valid email address.").max(200),
  password: z.string().min(10, "Use at least 10 characters.").max(128),
  memberType: z.enum(MEMBER_TYPES).optional().or(z.literal("")),
  location: z.string().trim().max(100).optional(),
  consent: z.literal("on", { errorMap: () => ({ message: "Please agree to the terms and privacy policy to join." }) })
});

export async function joinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (looksAutomated(formData)) return failure(formData, "We couldn't process that. Please try again.");
  if (await ipLimited("join", 5, HOUR)) return failure(formData, "Too many sign-ups from this connection. Please try again later.");

  const parsed = joinSchema.safeParse({ ...Object.fromEntries(formData), password: formData.get("password") });
  if (!parsed.success) return zodFailure(formData, parsed.error);
  const data = parsed.data;
  const email = normalizeEmail(data.email);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return failure(formData, "An account with this email already exists. Try signing in or resetting your password.", { email: "Already registered." });

  const policyVersion = await currentPolicyVersion();
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email,
      passwordHash: await bcrypt.hash(data.password, 12),
      memberType: data.memberType || null,
      location: data.location || null,
      // Joining never subscribes anyone to the mailing list; that has its own opt-in.
      consents: { create: { kind: "TERMS_AND_PRIVACY", policyVersion, source: "join-form", email } }
    }
  });

  await sendVerificationEmail(user.id, email, data.name).catch((err) => console.error("verification email failed:", err));
  redirect("/login?registered=1");
}

export async function resendVerificationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return failure(formData, "Please sign in first.");
  if (viewer.emailVerified) return success("Your email is already confirmed.");
  if (consume(`verify-resend:${viewer.id}`, 3, HOUR).limited) return failure(formData, "We've sent several links already. Please check your inbox, or try again in an hour.");
  const result = await sendVerificationEmail(viewer.id, viewer.email, viewer.name);
  if (result !== "sent") return failure(formData, "We couldn't send the email just now. It has been queued and we'll keep trying.");
  return success(`A new confirmation link is on its way to ${viewer.email}.`);
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(text(formData, "email"));
  if (!z.string().email().safeParse(email).success) return failure(formData, "Please enter a valid email address.");

  // Every request counts (known or unknown address), so the limits reveal nothing about accounts.
  const limited = (await ipLimited("forgot", 5, 15 * 60 * 1000)) || consume(`forgot:email:${email}`, 3, 15 * 60 * 1000).limited;
  if (limited) return failure(formData, "Too many requests. Please try again in a few minutes.");

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, suspendedAt: true } });
  if (user && !user.suspendedAt) {
    const token = await issueAuthToken(user.id, "RESET_PASSWORD");
    await sendEmail({
      to: email,
      kind: "reset-password",
      subject: "Reset your NBM password",
      html: renderEmail({
        heading: "Reset your password",
        paragraphs: ["Someone asked to reset the password for this NBM account. The link below works once and expires in one hour."],
        action: { label: "Choose a new password", url: `${baseUrl()}/reset-password?token=${token}` },
        footnote: "If this wasn't you, ignore this email and your password stays the same."
      })
    }).catch((err) => console.error("reset email failed:", err));
  }
  // Same answer either way, to avoid revealing which addresses have accounts.
  return success("If an account exists for that address, a reset link has been sent. Check your inbox.");
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (password.length < 10 || password.length > 128) return failure(formData, "Use at least 10 characters for your new password.");
  if (password !== confirmPassword) return failure(formData, "The two passwords don't match.");
  if (await ipLimited("reset", 10, HOUR)) return failure(formData, "Too many attempts. Please try again later.");

  const userId = await consumeAuthToken(text(formData, "token"), "RESET_PASSWORD");
  if (!userId) return failure(formData, "This reset link is invalid or has expired. Please request a new one.");

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 12), emailVerified: new Date() } });
  redirect("/login?reset=1");
}
