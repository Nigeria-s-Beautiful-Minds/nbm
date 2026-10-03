import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mediaUrl } from "@/lib/uploads";

export const NEWS_CATEGORIES = ["Announcements", "Community", "Projects", "Opportunities", "Events"] as const;
export const NEWS_PAGE_SIZE = 9;

const newsInclude = { author: { select: { name: true } }, linkedExhibition: { select: { slug: true, title: true, status: true } } } satisfies Prisma.NewsArticleInclude;

/** Published articles only. Drafts and archived articles never appear in public lists or search. */
export async function listNews({ category, q, page = 1, pageSize = NEWS_PAGE_SIZE }: { category?: string; q?: string; page?: number; pageSize?: number }) {
  try {
    const where: Prisma.NewsArticleWhereInput = {
      status: "PUBLISHED",
      ...(category ? { category } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { excerpt: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }] } : {})
    };
    const [items, total] = await Promise.all([
      prisma.newsArticle.findMany({ where, orderBy: { publishedAt: "desc" }, skip: (Math.max(1, page) - 1) * pageSize, take: pageSize, include: newsInclude }),
      prisma.newsArticle.count({ where })
    ]);
    return { items, total };
  } catch (err) {
    console.error("listNews failed:", err);
    return { items: [], total: 0 };
  }
}

/** A published article for anyone; an unpublished one only when `canPreview` (staff with content.edit). */
export async function getNewsArticle(slug: string, canPreview: boolean) {
  const row = await prisma.newsArticle.findUnique({ where: { slug }, include: newsInclude });
  if (!row) return null;
  return row.status === "PUBLISHED" || canPreview ? row : null;
}

export async function listTeam() {
  try {
    return await prisma.teamMember.findMany({ where: { published: true }, orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });
  } catch (err) {
    console.error("listTeam failed:", err);
    return [];
  }
}

export const coverUrl = (uploadId: string | null) => (uploadId ? mediaUrl(uploadId) : null);
