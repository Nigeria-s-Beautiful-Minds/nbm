import { NextResponse } from "next/server";
import { removeComment } from "@/lib/exhibitions";
import { apiMember } from "@/lib/viewer";

type Params = { params: Promise<{ id: string; commentId: string }> };

// The comment's author, or a moderator, can remove it.
export async function DELETE(_request: Request, { params }: Params) {
  const { viewer, response } = await apiMember("remove a comment");
  if (response) return response;
  const { commentId } = await params;
  if (!(await removeComment(commentId, viewer))) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
