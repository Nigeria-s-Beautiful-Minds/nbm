import { NextResponse } from "next/server";
import { cancelRoom, roomAction, startRoom, type RoomAction } from "@/lib/rooms";
import { consume } from "@/lib/rate-limit";
import { apiMember } from "@/lib/viewer";

type Params = { params: Promise<{ id: string }> };

const ACTIONS: RoomAction[] = ["request", "cancel-request", "leave", "approve", "decline", "demote", "mute", "remove", "end"];

// Requests to speak and every host control. Permissions are checked in lib/rooms.ts for each
// action, and each change is applied to the audio service, not just to the page.
export async function POST(request: Request, { params }: Params) {
  const { viewer, response } = await apiMember("do that");
  if (response) return response;
  const { id } = await params;
  if (consume(`roomaction:${viewer.id}`, 120, 10 * 60 * 1000).limited) return NextResponse.json({ error: "Please slow down." }, { status: 429 });

  const body = await request.json().catch(() => null);
  const action = body?.action as string;
  const result =
    action === "start" ? await startRoom(id, viewer)
    : action === "cancel" ? await cancelRoom(id, viewer)
    : ACTIONS.includes(action as RoomAction) ? await roomAction(id, viewer, action as RoomAction, typeof body?.userId === "string" ? body.userId : undefined)
    : { ok: false as const, error: "Unknown action.", status: 400 };

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
