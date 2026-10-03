import { NextResponse } from "next/server";
import type { UploadPurpose } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLimits } from "@/lib/config";
import { can } from "@/lib/permissions";
import { consume } from "@/lib/rate-limit";
import { createUploadTarget } from "@/lib/storage";
import { extensionForMime, ruleFor } from "@/lib/uploads";
import { apiMember } from "@/lib/viewer";

const UPLOAD_LIMIT = 30;
const UPLOAD_WINDOW_MS = 60 * 60 * 1000;
const PREFIX: Record<UploadPurpose, string> = { EXHIBITION_MEDIA: "exhibitions", APPLICATION_DOCUMENT: "applications", NEWS_COVER: "news", TEAM_PHOTO: "team" };

// Step 1 of any upload: record it and hand back a URL the browser can PUT the file to directly.
// Step 2 is POST /api/uploads/[id]/complete, which re-reads the stored bytes before anything
// can use the file.
export async function POST(request: Request) {
  const { viewer, response } = await apiMember("upload files");
  if (response) return response;

  if (consume(`upload:${viewer.id}`, UPLOAD_LIMIT, UPLOAD_WINDOW_MS).limited) {
    return NextResponse.json({ error: "You're uploading too quickly. Please try again shortly." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const purpose = body?.purpose as UploadPurpose | undefined;
  const mime = typeof body?.mime === "string" ? body.mime : "";
  const size = Number(body?.size);

  if (!purpose || !(purpose in PREFIX)) return NextResponse.json({ error: "Unknown upload type." }, { status: 400 });
  // Editorial images are for staff with the content capability only.
  if ((purpose === "NEWS_COVER" || purpose === "TEAM_PHOTO") && !can(viewer.roles, "content.edit")) {
    return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
  }

  const rule = ruleFor(purpose, mime, await getLimits());
  if (!rule) {
    return NextResponse.json({ error: purpose === "APPLICATION_DOCUMENT" ? "Please upload a PDF." : "Please upload a PNG, JPEG or WEBP image, or an MP4 video." }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0 || size > rule.maxBytes) {
    return NextResponse.json({ error: `The file is too large. The limit is ${rule.label}.` }, { status: 413 });
  }

  // Unguessable key; the id in the public media URL is a separate random id.
  const storageKey = `${PREFIX[purpose]}/${viewer.id}/${crypto.randomUUID()}.${extensionForMime(mime)}`;
  const upload = await prisma.upload.create({ data: { userId: viewer.id, purpose, storageKey, mime, size: Math.round(size) } });
  const target = await createUploadTarget(upload.id, storageKey, mime);
  if ("error" in target) {
    await prisma.upload.delete({ where: { id: upload.id } });
    return NextResponse.json({ error: target.error }, { status: 503 });
  }
  return NextResponse.json({ uploadId: upload.id, url: target.url, headers: target.headers });
}
