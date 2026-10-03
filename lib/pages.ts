import { prisma } from "@/lib/prisma";
import { isProductionStage } from "@/lib/config";

export type SitePage = { slug: string; version: number; title: string; body: string; effectiveDate: Date | null; isDraft: boolean };

/**
 * The latest published version of an editable page. In staging, a page that has never been
 * published falls back to its newest draft (flagged, so the page shows a "draft" notice);
 * in production drafts are never shown.
 */
export async function getSitePage(slug: string): Promise<SitePage | null> {
  try {
    const published = await prisma.pageVersion.findFirst({ where: { slug, status: "PUBLISHED" }, orderBy: { version: "desc" } });
    if (published) return { ...published, isDraft: false };
    if (isProductionStage) return null;
    const draft = await prisma.pageVersion.findFirst({ where: { slug, status: "DRAFT" }, orderBy: { version: "desc" } });
    return draft ? { ...draft, isDraft: true } : null;
  } catch (err) {
    console.error("getSitePage failed:", err);
    return null;
  }
}

/** Recorded with every consent so we know which wording a person agreed to. */
export async function currentPolicyVersion(): Promise<string> {
  const page = await getSitePage("privacy");
  return page ? `privacy-v${page.version}${page.isDraft ? "-draft" : ""}` : "privacy-unpublished";
}
