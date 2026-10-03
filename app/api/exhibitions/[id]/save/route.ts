import { NextResponse } from "next/server";
import { setSaved } from "@/lib/exhibitions";
import { apiMember } from "@/lib/viewer";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { viewer, response } = await apiMember("save posts");
  if (response) return response;
  const { id } = await params;
  if (!(await setSaved(id, viewer.id, true))) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { viewer, response } = await apiMember("save posts");
  if (response) return response;
  const { id } = await params;
  if (!(await setSaved(id, viewer.id, false))) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
