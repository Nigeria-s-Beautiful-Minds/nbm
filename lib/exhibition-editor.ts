import { prisma } from "@/lib/prisma";

/** The author's own threads, opportunities and approved campaigns that a post can link to. */
export async function linkOptionsFor(userId: string) {
  const [threads, opportunities, campaigns] = await Promise.all([
    prisma.thread.findMany({ where: { hostId: userId, status: { not: "ARCHIVED" } }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, title: true } }),
    prisma.opportunity.findMany({ where: { mentorId: userId, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, title: true } }),
    prisma.campaign.findMany({ where: { requesterId: userId, status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, title: true } })
  ]);
  return { threads, opportunities, campaigns };
}
