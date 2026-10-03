import { NextResponse } from "next/server";
import { editMessage, removeMessage } from "@/lib/discussions";
import { TEXT_LIMITS } from "@/lib/constants";
import { apiMember } from "@/lib/viewer";

type Params = { params: Promise<{ id: string; messageId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { viewer, response } = await apiMember("edit a message");
  if (response) return response;
  const { messageId } = await params;
  const body = await request.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text || text.length > TEXT_LIMITS.message) return NextResponse.json({ error: `Please write a message of up to ${TEXT_LIMITS.message} characters.` }, { status: 400 });
  const result = await editMessage(messageId, viewer, text);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

// The author, the thread's own host, or a moderator can remove a message.
export async function DELETE(_request: Request, { params }: Params) {
  const { viewer, response } = await apiMember("remove a message");
  if (response) return response;
  const { messageId } = await params;
  if (!(await removeMessage(messageId, viewer))) return NextResponse.json({ error: "You can't remove that message." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
