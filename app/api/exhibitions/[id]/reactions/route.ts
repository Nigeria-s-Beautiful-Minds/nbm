import { NextResponse } from "next/server";
import { setReaction } from "@/lib/exhibitions";
import { REACTIONS, type ReactionEmoji } from "@/lib/constants";
import { consume } from "@/lib/rate-limit";
import { apiMember } from "@/lib/viewer";

type Params = { params: Promise<{ id: string }> };

const REACTION_LIMIT = 60;
const REACTION_WINDOW_MS = 10 * 60 * 1000;

// Sets (or changes) the signed-in member's reaction to this post. One reaction per person.
export async function POST(request: Request, { params }: Params) {
  const { viewer, response } = await apiMember("react");
  if (response) return response;
  const { id } = await params;

  if (consume(`exhreaction:${viewer.id}`, REACTION_LIMIT, REACTION_WINDOW_MS).limited) return NextResponse.json({ error: "Please slow down." }, { status: 429 });

  const body = await request.json().catch(() => null);
  const emoji = body?.emoji as ReactionEmoji | undefined;
  if (!emoji || !(REACTIONS as readonly string[]).includes(emoji)) return NextResponse.json({ error: "Unsupported reaction." }, { status: 400 });

  if (!(await setReaction(id, viewer.id, emoji))) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { viewer, response } = await apiMember("react");
  if (response) return response;
  const { id } = await params;
  if (!(await setReaction(id, viewer.id, null))) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
