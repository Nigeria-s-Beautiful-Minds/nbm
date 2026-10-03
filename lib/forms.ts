// Shared shape for server-action forms. On a recoverable error the action returns the submitted
// values so <ActionForm> can put them back: nobody has to retype a form because one field was wrong.
import { headers } from "next/headers";
import type { ZodError } from "zod";
import { clientIp, consume } from "@/lib/rate-limit";

export type FormState = {
  ok: boolean;
  message?: string;
  error?: string;
  values?: Record<string, string>;
  fieldErrors?: Record<string, string>;
  /** Changes on every response so the form's fields re-read their defaults. */
  nonce?: number;
};

const PRIVATE_FIELDS = new Set(["password", "confirmPassword", "currentPassword", "nbm_hp", "nbm_ts"]);

/** The text fields of a submission, minus passwords and the bot-check fields. */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || PRIVATE_FIELDS.has(key) || key.startsWith("$ACTION")) continue;
    values[key] = values[key] ? `${values[key]},${value}` : value;
  }
  return values;
}

export function failure(formData: FormData, error: string, fieldErrors?: Record<string, string>): FormState {
  return { ok: false, error, fieldErrors, values: formValues(formData), nonce: Date.now() };
}

export function success(message: string): FormState {
  return { ok: true, message, nonce: Date.now() };
}

export function zodFailure(formData: FormData, error: ZodError, message = "Please check the highlighted fields."): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return failure(formData, message, fieldErrors);
}

/**
 * Light bot protection for public forms: a hidden field that people never fill in, and a minimum
 * time between rendering the form and submitting it. Returns true when the submission looks automated.
 */
export function looksAutomated(formData: FormData): boolean {
  if (String(formData.get("nbm_hp") ?? "") !== "") return true;
  const renderedAt = Number(formData.get("nbm_ts"));
  return !Number.isFinite(renderedAt) || Date.now() - renderedAt < 1500;
}

/** Rate limit keyed on the caller's IP. Returns true when the caller should be turned away. */
export async function ipLimited(bucket: string, limit: number, windowMs: number): Promise<boolean> {
  const ip = clientIp(await headers());
  return consume(`${bucket}:${ip}`, limit, windowMs).limited;
}

export const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
