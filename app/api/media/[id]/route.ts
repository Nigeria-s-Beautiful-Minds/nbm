import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { createSignedViewUrl, openLocalObject, storageDriver } from "@/lib/storage";
import { getViewer, type Viewer } from "@/lib/viewer";

type Params = { params: Promise<{ id: string }> };

const uploadInclude = {
  exhibitionMedia: { select: { live: true, exhibition: { select: { status: true, authorId: true } } } },
  application: { select: { applicantId: true, matches: { select: { mentorId: true, status: true } } } },
  newsArticle: { select: { status: true } },
  teamMember: { select: { published: true } }
} as const;

type UploadRow = NonNullable<Awaited<ReturnType<typeof loadUpload>>>;

function loadUpload(id: string) {
  return prisma.upload.findUnique({ where: { id }, include: uploadInclude });
}

/** Returns "public" when anyone may see the file, "private" when only this viewer may, or null to refuse. */
function access(upload: UploadRow, viewer: Viewer | null): "public" | "private" | null {
  const owns = viewer?.id === upload.userId;

  if (upload.purpose === "EXHIBITION_MEDIA") {
    const media = upload.exhibitionMedia;
    if (media?.live && media.exhibition.status === "APPROVED") return "public";
    // Drafts, pending, rejected, withdrawn and removed posts: the author and reviewers only.
    return owns || can(viewer?.roles, "exhibitions.review") ? "private" : null;
  }
  if (upload.purpose === "APPLICATION_DOCUMENT") {
    if (owns || can(viewer?.roles, "mentorship.coordinate")) return "private";
    // A mentor sees a document only through a match a coordinator proposed to them.
    const shared = upload.application?.matches.some((m) => m.mentorId === viewer?.id && ["PROPOSED", "ACTIVE", "COMPLETED", "REMATCH_REQUESTED"].includes(m.status));
    return viewer && shared ? "private" : null;
  }
  if (upload.purpose === "NEWS_COVER") {
    if (upload.newsArticle?.status === "PUBLISHED") return "public";
    return can(viewer?.roles, "content.edit") ? "private" : null;
  }
  if (upload.purpose === "TEAM_PHOTO") {
    if (upload.teamMember?.published) return "public";
    return can(viewer?.roles, "content.edit") ? "private" : null;
  }
  return null;
}

// Storage is private, so every view goes through here. Hidden or unlisted links are never the
// protection: the check is repeated on each request.
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const upload = await loadUpload(id);
  if (!upload || !upload.verifiedAt) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const mode = access(upload, await getViewer());
  if (!mode) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Never let a shared cache keep a copy of something that may stop being public.
  const cacheControl = mode === "public" ? "private, max-age=240" : "private, no-store";
  const disposition = upload.purpose === "APPLICATION_DOCUMENT" ? "attachment" : "inline";

  if (storageDriver() === "r2") {
    const url = await createSignedViewUrl(upload.storageKey);
    if (!url) return NextResponse.json({ error: "Media is temporarily unavailable." }, { status: 502 });
    // Redirecting lets R2 serve the bytes itself, including Range requests for video seeking.
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": cacheControl } });
  }

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");
  const whole = await openLocalObject(upload.storageKey);
  if (!whole) return NextResponse.json({ error: "Media is temporarily unavailable." }, { status: 502 });
  const headers: Record<string, string> = {
    "Content-Type": upload.mime,
    "Cache-Control": cacheControl,
    "Accept-Ranges": "bytes",
    "Content-Disposition": disposition,
    "X-Content-Type-Options": "nosniff"
  };

  if (range && (range[1] || range[2])) {
    const size = whole.size;
    await whole.stream.cancel();
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const part = await openLocalObject(upload.storageKey, start, end);
    if (!part) return NextResponse.json({ error: "Media is temporarily unavailable." }, { status: 502 });
    return new NextResponse(part.stream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }

  return new NextResponse(whole.stream, { status: 200, headers: { ...headers, "Content-Length": String(whole.size) } });
}
