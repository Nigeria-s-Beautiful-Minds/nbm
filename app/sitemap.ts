import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Only published, public pages. Account, staff, draft, pending and private records never appear.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = baseUrl();
  const fixed = ["", "/about", "/about/news", "/about/team", "/about/privacy", "/terms", "/community-standards", "/get-involved", "/get-involved/contribute", "/get-involved/volunteer", "/get-involved/mailing-list", "/get-involved/contact", "/exhibitions", "/discussion", "/mentorship", "/sponsorship", "/scholarships"];
  const [exhibitions, news, threads, opportunities, campaigns] = await Promise.all([
    prisma.exhibition.findMany({ where: { status: "APPROVED" }, select: { slug: true, updatedAt: true }, take: 2000 }),
    prisma.newsArticle.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true }, take: 2000 }),
    prisma.thread.findMany({ where: { status: { not: "ARCHIVED" }, audioRooms: { none: {} } }, select: { id: true, updatedAt: true }, take: 2000 }),
    prisma.opportunity.findMany({ where: { status: "PUBLISHED" }, select: { id: true, updatedAt: true }, take: 2000 }),
    prisma.campaign.findMany({ where: { status: "OPEN" }, select: { slug: true, updatedAt: true }, take: 2000 })
  ]).catch(() => [[], [], [], [], []] as const);
  return [
    ...fixed.map((path) => ({ url: `${base}${path}` })),
    ...exhibitions.map((row) => ({ url: `${base}/exhibitions/${row.slug}`, lastModified: row.updatedAt })),
    ...news.map((row) => ({ url: `${base}/about/news/${row.slug}`, lastModified: row.updatedAt })),
    ...threads.map((row) => ({ url: `${base}/discussion/${row.id}`, lastModified: row.updatedAt })),
    ...opportunities.map((row) => ({ url: `${base}/mentorship/opportunities/${row.id}`, lastModified: row.updatedAt })),
    ...campaigns.map((row) => ({ url: `${base}/sponsorship/${row.slug}`, lastModified: row.updatedAt }))
  ];
}
