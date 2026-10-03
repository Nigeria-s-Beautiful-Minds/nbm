import { NextResponse } from "next/server";
import { createComment } from "@/lib/exhibitions";
import { TEXT_LIMITS } from "@/lib/constants";
import { consume } from "@/lib/rate-limit";
import { apiMember } from "@/lib/viewer";

type Params = { params: Promise<{ id: string }> };

const COMMENT_LIMIT = 30;
const COMMENT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request, { params }: Params) {
  const { viewer, response } = await apiMember("comment");
  if (response) return response;
  const { id } = await params;

  if (consume(`exhcomment:${viewer.id}`, COMMENT_LIMIT, COMMENT_WINDOW_MS).limited) {
    return NextResponse.json({ error: "You're commenting too quickly. Please slow down." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text || text.length > TEXT_LIMITS.comment) {
    return NextResponse.json({ error: `Please write a comment of up to ${TEXT_LIMITS.comment} characters.` }, { status: 400 });
  }
  const parentId = typeof body?.parentId === "string" && body.parentId ? body.parentId : null;

  const result = await createComment(id, viewer, text, parentId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result, { status: 201 });
}
