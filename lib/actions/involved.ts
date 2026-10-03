"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { baseUrl, getCommittees } from "@/lib/config";
import { failure, ipLimited, looksAutomated, success, text, zodFailure, type FormState } from "@/lib/forms";
import { renderEmail, sendEmail } from "@/lib/mailer";
import { currentPolicyVersion } from "@/lib/pages";
import { consume, normalizeEmail } from "@/lib/rate-limit";
import { hashToken, randomToken } from "@/lib/tokens";

const HOUR = 60 * 60 * 1000;

const volunteerSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().email("Please enter a valid email address."),
  interests: z.string().trim().min(10, "Tell us a little about what interests you.").max(2000),
  committee: z.string().trim().min(1, "Please choose a committee."),
  skills: z.string().trim().min(5, "Tell us about relevant skills or experience.").max(2000),
  availability: z.string().trim().min(3, "Roughly how much time can you give?").max(300)
});

export async function volunteerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (looksAutomated(formData)) return failure(formData, "We couldn't process that. Please try again.");
  if (await ipLimited("volunteer", 5, HOUR)) return failure(formData, "Too many submissions from this connection. Please try again later.");
  const parsed = volunteerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodFailure(formData, parsed.error);
  if (!(await getCommittees()).includes(parsed.data.committee)) return failure(formData, "Please choose a committee from the list.", { committee: "Choose one." });
  const email = normalizeEmail(parsed.data.email);
  if (consume(`volunteer:${email}`, 2, 24 * HOUR).limited) return failure(formData, "We already have a recent application from this address.");

  const application = await prisma.volunteerApplication.create({ data: { ...parsed.data, email } });
  // The application is saved first; the receipt email is a courtesy and its failure changes nothing.
  await sendEmail({
    to: email,
    kind: "volunteer-receipt",
    dedupeKey: `volunteer-receipt:${application.id}`,
    subject: "We received your NBM volunteer application",
    html: renderEmail({ heading: "Thank you for offering to volunteer", paragraphs: [`Hello ${parsed.data.name}, we have received your application for the ${parsed.data.committee} committee.`, "Our team reviews every application and will reply by email. This message confirms receipt only; it is not an acceptance."] })
  }).catch((err) => console.error("volunteer receipt failed:", err));
  return success("Thank you. Your application has been received and saved. Our team will review it and reply by email; this is a receipt, not an acceptance.");
}

const mailingSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  name: z.string().trim().max(120).optional(),
  consent: z.literal("on", { errorMap: () => ({ message: "Please tick the box to confirm you want these emails." }) })
});

export async function mailingListAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (looksAutomated(formData)) return failure(formData, "We couldn't process that. Please try again.");
  if (await ipLimited("mailing", 8, HOUR)) return failure(formData, "Too many requests. Please try again later.");
  const parsed = mailingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodFailure(formData, parsed.error);
  const email = normalizeEmail(parsed.data.email);
  // The same answer whether or not the address is already subscribed, so the form reveals nothing.
  const done = success("Almost there. If this address isn't already subscribed, we've sent a confirmation link. You'll only be added once you click it.");
  if (consume(`mailing:${email}`, 3, HOUR).limited) return done;

  const existing = await prisma.mailingSubscriber.findUnique({ where: { email } });
  if (existing?.status === "ACTIVE") return done;

  // One row per address: a repeat request refreshes the pending confirmation instead of adding a duplicate.
  const token = randomToken();
  const policyVersion = await currentPolicyVersion();
  const data = { name: parsed.data.name || null, status: "PENDING" as const, confirmTokenHash: hashToken(token), source: "mailing-list-form", policyVersion };
  const subscriber = existing
    ? await prisma.mailingSubscriber.update({ where: { email }, data })
    : await prisma.mailingSubscriber.create({ data: { ...data, email, unsubscribeToken: randomToken() } });

  await sendEmail({
    to: email,
    kind: "mailing-confirm",
    subject: "Confirm your subscription to NBM updates",
    html: renderEmail({
      heading: "Please confirm your subscription",
      paragraphs: ["You (or someone using this address) asked to receive occasional updates from Nigeria's Beautiful Minds. Click below to confirm. If you didn't ask for this, ignore this email and you won't be subscribed."],
      action: { label: "Confirm subscription", url: `${baseUrl()}/get-involved/mailing-list/confirm?token=${token}` },
      footnote: `Unsubscribe at any time: ${baseUrl()}/get-involved/mailing-list/unsubscribe?token=${subscriber.unsubscribeToken}`
    })
  }).catch((err) => console.error("mailing confirmation failed:", err));
  return done;
}

export async function unsubscribeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = text(formData, "token");
  const result = token ? await prisma.mailingSubscriber.updateMany({ where: { unsubscribeToken: token }, data: { status: "UNSUBSCRIBED", confirmTokenHash: null } }) : { count: 0 };
  if (result.count === 0) return failure(formData, "This unsubscribe link isn't valid. Please contact us and we'll remove you.");
  return success("You have been unsubscribed and won't receive further mailing-list emails.");
}

const contactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().email("Please enter a valid email address."),
  subject: z.string().trim().min(3, "Please add a subject.").max(180),
  message: z.string().trim().min(10, "Please write a message (at least 10 characters).").max(5000),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{8,64}$/)
});

export async function contactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (looksAutomated(formData)) return failure(formData, "We couldn't process that. Please try again.");
  if (await ipLimited("contact", 5, HOUR)) return failure(formData, "Too many messages from this connection. Please try again later.");
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodFailure(formData, parsed.error);
  const { idempotencyKey, ...fields } = parsed.data;

  // Saved before anything else. Sending the same form twice finds the first copy instead of making another.
  const saved = await prisma.contactRequest.upsert({ where: { idempotencyKey }, update: {}, create: { ...fields, email: normalizeEmail(fields.email), idempotencyKey } });

  const recipient = process.env.CONTACT_TO_EMAIL;
  let delivered: "sent" | "queued" | "failed" | "unconfigured" = "unconfigured";
  if (recipient) {
    delivered = await sendEmail({
      to: recipient,
      kind: "contact-notification",
      dedupeKey: `contact:${saved.id}`,
      subject: `NBM contact form: ${fields.subject}`,
      html: renderEmail({ heading: "New contact request", paragraphs: [`From: ${fields.name} <${fields.email}>`, `Subject: ${fields.subject}`, fields.message], action: { label: "Open in staff tools", url: `${baseUrl()}/admin/operations` } })
    }).catch(() => "failed" as const);
  }
  // The log records that a notification was attempted and how it went, never the message itself.
  console.log(`[contact] request ${saved.id} saved; notification ${delivered}`);

  return success(
    delivered === "sent"
      ? "Thank you. Your message has been received and our team has been notified."
      : "Thank you. Your message has been saved and our team will see it in their inbox queue. The email alert to staff couldn't be sent just now and will be retried, so a reply may take a little longer."
  );
}
