import { NextResponse } from "next/server";
import { deleteExhibition, saveExhibition, withdrawExhibition } from "@/lib/exhibitions";
import { consume } from "@/lib/rate-limit";
import { apiMember } from "@/lib/viewer";

type Params = { params: Promise<{ id: string }> };

// The author saves, submits or withdraws their own post. Ownership is checked in lib/exhibitions.ts.
export async function PATCH(request: Request, { params }: Params) {
  const { viewer, response } = await apiMember("edit a post");
  if (response) return response;
  const { id } = await params;

  if (consume(`exhsave:${viewer.id}`, 60, 60 * 60 * 1000).limited) {
    return NextResponse.json({ error: "You're saving too quickly. Please try again shortly." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (body?.intent === "withdraw") {
    const done = await withdrawExhibition(viewer, id);
    if (!done) return NextResponse.json({ error: "This post can't be withdrawn." }, { status: 400 });
    return NextResponse.json({ ok: true, status: "WITHDRAWN", message: "Withdrawn. The post is no longer public or in the review queue." });
  }

  const result = await saveExhibition(viewer, id, body, body?.intent === "submit" ? "submit" : "draft");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  return NextResponse.json(result);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { viewer, response } = await apiMember("delete a post");
  if (response) return response;
  const { id } = await params;
  const deleted = await deleteExhibition(viewer, id);
  if (!deleted) return NextResponse.json({ error: "You can only delete your own posts." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
