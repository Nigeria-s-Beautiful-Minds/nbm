import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLimits } from "@/lib/config";
import { putObject, storageDriver, verifyLocalUpload } from "@/lib/storage";
import { ruleFor } from "@/lib/uploads";

type Params = { params: Promise<{ id: string }> };

// Development only: stands in for the presigned PUT that R2 provides in staging/production.
// The signed, expiring URL from /api/uploads is the permission; it is scoped to one upload id.
export async function PUT(request: Request, { params }: Params) {
  if (storageDriver() !== "local") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { id } = await params;
  const url = new URL(request.url);
  if (!verifyLocalUpload(id, Number(url.searchParams.get("exp")), url.searchParams.get("sig") || "")) {
    return NextResponse.json({ error: "This upload link has expired. Please try again." }, { status: 403 });
  }

  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload || upload.attached) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const rule = ruleFor(upload.purpose, upload.mime, await getLimits());
  if (!rule || !request.body) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });

  // Count bytes as they arrive so an oversized body is cut off rather than stored.
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > rule.maxBytes) {
      await reader.cancel();
      return NextResponse.json({ error: `The file is too large. The limit is ${rule.label}.` }, { status: 413 });
    }
    chunks.push(value);
  }

  const ok = await putObject(upload.storageKey, Buffer.concat(chunks), upload.mime);
  if (!ok) return NextResponse.json({ error: "Could not store the file." }, { status: 500 });
  return new NextResponse(null, { status: 200 });
}
