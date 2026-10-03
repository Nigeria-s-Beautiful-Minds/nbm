import { NextResponse } from "next/server";
import { processEmailQueue } from "@/lib/mailer";
import { reconcileRooms } from "@/lib/rooms";
import { safeEqual } from "@/lib/tokens";
import { cleanupAbandonedUploads } from "@/lib/uploads";
import { prisma } from "@/lib/prisma";

// Scheduled housekeeping, called by a cron (Vercel Cron daily on the Hobby plan, or `npm run jobs`):
// retry queued email, delete uploads that were never attached to anything, close audio rooms
// whose host never came back, and expire unanswered match offers. Protected by JOBS_SECRET.
export async function POST(request: Request) {
  // Vercel Cron sends "Authorization: Bearer $CRON_SECRET"; `npm run jobs` sends JOBS_SECRET.
  const secret = process.env.CRON_SECRET || process.env.JOBS_SECRET;
  const given = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!secret || !safeEqual(secret, given)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const email = await processEmailQueue();
  const uploadsRemoved = await cleanupAbandonedUploads();
  const roomsEnded = await reconcileRooms();

  const expired = await prisma.match.findMany({ where: { status: "PROPOSED", expiresAt: { lt: new Date() } }, select: { id: true, applicationId: true } });
  for (const match of expired) {
    await prisma.$transaction([
      prisma.match.updateMany({ where: { id: match.id, status: "PROPOSED" }, data: { status: "EXPIRED", closedAt: new Date() } }),
      prisma.mentorshipApplication.updateMany({ where: { id: match.applicationId, status: "MATCH_PROPOSED" }, data: { status: "REVIEWING" } })
    ]);
  }

  return NextResponse.json({ ok: true, email, uploadsRemoved, roomsEnded, matchesExpired: expired.length });
}

export const GET = POST;
