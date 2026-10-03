import { NextResponse } from "next/server";
import { createMessage, getThread, listMessages } from "@/lib/discussions";
import { TEXT_LIMITS } from "@/lib/constants";
import { consume } from "@/lib/rate-limit";
import { apiMember, getViewer } from "@/lib/viewer";

type Params = { params: Promise<{ id: string }> };

const MESSAGE_LIMIT = 60;
const MESSAGE_WINDOW_MS = 10 * 60 * 1000;

// Polled every few seconds by an open thread page. ?after=<messageId> returns only what's new;
// ?before=<messageId> returns the previous page of older messages.
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const viewer = await getViewer();
  const thread = await getThread(id, viewer);
  if (!thread) return NextResponse.json({ error: "Discussion not found." }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const result = await listMessages(id, viewer?.id, { after: query.get("after") || undefined, before: query.get("before") || undefined });
  return NextResponse.json({ ...result, status: thread.status });
}

export async function POST(request: Request, { params }: Params) {
  const { viewer, response } = await apiMember("post a message");
  if (response) return response;
  const { id } = await params;

  if (consume(`threadmsg:${viewer.id}`, MESSAGE_LIMIT, MESSAGE_WINDOW_MS).limited) {
    return NextResponse.json({ error: "You're posting too quickly. Please slow down." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  if (!text || text.length > TEXT_LIMITS.message) {
    return NextResponse.json({ error: `Please write a message of up to ${TEXT_LIMITS.message} characters.` }, { status: 400 });
  }
  if (!/^[A-Za-z0-9-]{8,64}$/.test(clientId)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const parentId = typeof body?.parentId === "string" && body.parentId ? body.parentId : null;

  const result = await createMessage(id, viewer, text, clientId, parentId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result, { status: 201 });
}
