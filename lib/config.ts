// Server-only configuration read from the environment and the Setting table.
import { prisma } from "@/lib/prisma";
import { DEFAULT_LIMITS, type PilotLimits } from "@/lib/constants";

export const isProductionStage = process.env.SITE_STAGE === "production";

export function baseUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:4174").replace(/\/$/, "");
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    return row ? (row.value as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const json = value as never;
  await prisma.setting.upsert({ where: { key }, update: { value: json }, create: { key, value: json } });
}

export async function getLimits(): Promise<PilotLimits> {
  return { ...DEFAULT_LIMITS, ...(await getSetting<Partial<PilotLimits>>("pilotLimits", {})) };
}

export const DEFAULT_COMMITTEES = ["Events", "Mentorship", "Outreach", "Project review"];

export async function getCommittees(): Promise<string[]> {
  return getSetting<string[]>("volunteerCommittees", DEFAULT_COMMITTEES);
}

/** The relationship with Optimais Labs is shown publicly only once the founder has confirmed it. */
export async function optimaisRelationshipConfirmed(): Promise<boolean> {
  return getSetting<boolean>("optimaisRelationshipConfirmed", false);
}
