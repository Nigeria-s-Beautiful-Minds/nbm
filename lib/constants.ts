// Dependency-free, so it is safe to import from both server code and browser components.

export const SITE_NAME = "Nigeria's Beautiful Minds";
export const SITE_SHORT = "NBM";
export const SITE_DESCRIPTOR = "A community for research, innovation and collaboration.";
export const CONTACT_EMAIL = "nigeriasbeautifulminds@gmail.com";

export const TOPICS = [
  "AI & Data",
  "Agriculture & Food",
  "Health & Biotech",
  "Energy & Climate",
  "Engineering & Robotics",
  "Software & Digital",
  "Environment & Water",
  "Policy & Society",
  "Other"
] as const;

// What a project has actually shown so far. Labelled on every exhibition so popularity is never
// mistaken for evidence.
export const PROJECT_STAGES: Record<string, string> = {
  IDEA: "Idea",
  PROPOSED: "Proposed",
  PROTOTYPE: "Prototype",
  DEMONSTRATED: "Demonstrated",
  TESTED: "Tested with users",
  IN_USE: "In use"
};

export const MEMBER_TYPES = [
  "Student",
  "Early-career researcher",
  "Researcher or academic",
  "Innovator or builder",
  "Industry professional",
  "Supporter"
] as const;

// A fixed set keeps the reaction bar meaningful and stops the field being used to store arbitrary text.
export const REACTIONS = ["👍", "❤️", "💡", "🎉", "👏", "😮"] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];

export const REPORT_REASONS = [
  "Spam or misleading",
  "Harassment or abuse",
  "Unsafe or harmful content",
  "Someone else's work without credit",
  "Other"
] as const;

export const FUNDING_STATUS: Record<string, string> = {
  UNFUNDED: "Unfunded (voluntary)",
  STIPEND_AVAILABLE: "Stipend available",
  SEEKING_SPONSORSHIP: "Seeking sponsorship",
  FUNDED: "Funded"
};

export const WORKING_MODES: Record<string, string> = { REMOTE: "Remote", LOCAL: "In person", HYBRID: "Hybrid" };
export const MENTOR_KINDS: Record<string, string> = { RESEARCH_PI: "Research PI", TECHNICAL_MENTOR: "Technical mentor" };
export const CAMPAIGN_KINDS: Record<string, string> = { PROJECT: "Project", COHORT: "Cohort", PLACEMENT: "Student placement" };

// Pilot defaults from the build guide; staff can change them at /admin/settings.
export type PilotLimits = {
  imageMaxMb: number;
  imagesPerPost: number;
  videoMaxMb: number;
  videoMaxSeconds: number;
  documentMaxMb: number;
  roomMaxParticipants: number;
  roomMaxSpeakers: number;
  hostGraceSeconds: number;
};

export const DEFAULT_LIMITS: PilotLimits = {
  imageMaxMb: 10,
  imagesPerPost: 5,
  videoMaxMb: 100,
  videoMaxSeconds: 180,
  documentMaxMb: 5,
  roomMaxParticipants: 25,
  roomMaxSpeakers: 5,
  hostGraceSeconds: 120
};

export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
// MP4 only for the pilot: it is the one format every supported browser plays, and its duration
// can be read from the stored file on the server.
export const VIDEO_MIME_TYPES = ["video/mp4"] as const;
export const DOCUMENT_MIME_TYPES = ["application/pdf"] as const;

export const TEXT_LIMITS = {
  title: 120,
  description: 5000,
  comment: 2000,
  message: 4000,
  alt: 300
};

export const THREAD_POLL_MS = 4000;
export const ROOM_POLL_MS = 4000;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "post";
}

export function initialsFromName(name?: string | null): string {
  const parts = (name?.trim() || "Member").split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0].slice(0, 2)).toUpperCase();
}

/** Amounts are stored as integer minor units (kobo, cents). */
export function formatMoney(minor: number | bigint, currency: string): string {
  const value = Number(minor) / 100;
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: value % 1 === 0 ? 0 : 2 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-NG")}`;
  }
}

// Fixed to UTC so the server render and the browser always agree; <LocalTime> shows local times.
export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
