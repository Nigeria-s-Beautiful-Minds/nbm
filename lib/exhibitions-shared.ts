// Dependency-free, so it is safe to import from both server code and browser components
// (lib/exhibitions.ts pulls in Prisma and must stay server-only).
import type { ReactionEmoji } from "@/lib/constants";

export type MediaItem = {
  id: string;
  uploadId: string;
  // Media is served through our own route (never a direct storage URL), so pending, rejected and
  // removed posts stay private to their author and to reviewers.
  url: string;
  kind: "IMAGE" | "VIDEO";
  alt: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
};

export type ExhibitionStatusKind = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "REMOVED";

export type ExhibitionSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  topic: string;
  stage: string;
  status: ExhibitionStatusKind;
  revisionStatus: "NONE" | "PENDING" | "REJECTED";
  featured: boolean;
  authorId: string;
  authorName: string;
  isOwn: boolean;
  createdAt: string;
  publishedAt: string | null;
  cover: MediaItem | null;
  mediaCount: number;
  commentCount: number;
  reactionTotal: number;
};

export type ExhibitionInput = {
  title: string;
  description: string;
  topic: string;
  stage: string;
  teamCredits: string;
  projectUrl: string;
  linkedThreadId: string | null;
  linkedOpportunityId: string | null;
  linkedCampaignId: string | null;
  media: { uploadId: string; alt: string; kind: "IMAGE" | "VIDEO"; width: number | null; height: number | null }[];
};

export type ExhibitionDetail = ExhibitionSummary & {
  teamCredits: string | null;
  projectUrl: string | null;
  media: MediaItem[];
  /** Live media plus any media that belongs to an edit awaiting review (author and reviewers only). */
  allMedia: MediaItem[];
  reactionCounts: Partial<Record<ReactionEmoji, number>>;
  viewerReaction: ReactionEmoji | null;
  saved: boolean;
  moderationNote: string | null;
  pendingRevision: ExhibitionInput | null;
  links: {
    thread: { id: string; title: string } | null;
    opportunity: { id: string; title: string } | null;
    campaign: { slug: string; title: string } | null;
  };
  linkIds: { threadId: string | null; opportunityId: string | null; campaignId: string | null };
};

export type CommentNode = {
  id: string;
  body: string;
  removed: boolean;
  createdAt: string;
  authorId: string;
  authorName: string;
  isOwn: boolean;
  replies: CommentNode[];
};

export const EXHIBITION_STATUS_LABELS: Record<ExhibitionStatusKind, string> = {
  DRAFT: "Draft",
  PENDING: "Awaiting review",
  APPROVED: "Published",
  REJECTED: "Not approved",
  WITHDRAWN: "Withdrawn",
  REMOVED: "Removed by moderators"
};
