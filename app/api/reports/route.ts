import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { REPORT_REASONS } from "@/lib/constants";
import { consume } from "@/lib/rate-limit";
import { apiMember } from "@/lib/viewer";

const REPORT_LIMIT = 10;
const REPORT_WINDOW_MS = 60 * 60 * 1000;

// What can be reported, and how to confirm the target really exists.
const TARGETS: Record<string, (id: string) => Promise<string | null>> = {
  EXHIBITION: async (id) => (await prisma.exhibition.findUnique({ where: { id }, select: { slug: true } }).then((r) => (r ? `/exhibitions/${r.slug}` : null))),
  EXHIBITION_COMMENT: async (id) => (await prisma.exhibitionComment.findUnique({ where: { id }, select: { exhibition: { select: { slug: true } } } }).then((r) => (r ? `/exhibitions/${r.exhibition.slug}#comments` : null))),
  THREAD: async (id) => (await prisma.thread.findUnique({ where: { id }, select: { id: true } }).then((r) => (r ? `/discussion/${r.id}` : null))),
  THREAD_MESSAGE: async (id) => (await prisma.threadMessage.findUnique({ where: { id }, select: { threadId: true } }).then((r) => (r ? `/discussion/${r.threadId}` : null))),
  AUDIO_ROOM: async (id) => (await prisma.audioRoom.findUnique({ where: { id }, select: { id: true } }).then((r) => (r ? `/discussion/rooms/${r.id}` : null)))
};

// Any member can report content. Reports go to the staff queue at /admin/reports.
export async function POST(request: Request) {
  const { viewer, response } = await apiMember("report content");
  if (response) return response;

  if (consume(`report:${viewer.id}`, REPORT_LIMIT, REPORT_WINDOW_MS).limited) {
    return NextResponse.json({ error: "You've sent several reports recently. Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const targetType = typeof body?.targetType === "string" ? body.targetType : "";
  const targetId = typeof body?.targetId === "string" ? body.targetId : "";
  const reason = typeof body?.reason === "string" ? body.reason : "";
  const details = typeof body?.details === "string" ? body.details.trim().slice(0, 1000) : "";

  if (!(targetType in TARGETS) || !targetId) return NextResponse.json({ error: "Unknown content." }, { status: 400 });
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return NextResponse.json({ error: "Please choose a reason." }, { status: 400 });
  const targetHref = await TARGETS[targetType](targetId);
  if (!targetHref) return NextResponse.json({ error: "That content no longer exists." }, { status: 404 });

  // One open report per person per item; reporting again just updates it.
  await prisma.report.upsert({
    where: { reporterId_targetType_targetId: { reporterId: viewer.id, targetType, targetId } },
    update: { reason, details: details || null },
    create: { reporterId: viewer.id, targetType, targetId, targetHref, reason, details: details || null }
  });
  return NextResponse.json({ ok: true, message: "Thank you. Our moderators will review this." }, { status: 201 });
}
