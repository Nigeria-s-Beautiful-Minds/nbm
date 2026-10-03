import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLimits } from "@/lib/config";
import { mediaUrl, verifyStoredUpload } from "@/lib/uploads";
import { apiMember } from "@/lib/viewer";

type Params = { params: Promise<{ id: string }> };

// Step 2 of an upload: check what storage actually received (size, file signature, video
// duration) before the file can be attached to anything.
export async function POST(_request: Request, { params }: Params) {
  const { viewer, response } = await apiMember("upload files");
  if (response) return response;
  const { id } = await params;

  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload || upload.userId !== viewer.id) return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  if (upload.verifiedAt) return NextResponse.json({ uploadId: upload.id, url: mediaUrl(upload.id), durationSec: upload.durationSec });

  const result = await verifyStoredUpload(upload, await getLimits());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ uploadId: upload.id, url: mediaUrl(upload.id), durationSec: result.upload.durationSec });
}
