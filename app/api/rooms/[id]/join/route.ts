import { NextResponse } from "next/server";
import { joinRoom } from "@/lib/rooms";
import { consume } from "@/lib/rate-limit";
import { apiMember } from "@/lib/viewer";

type Params = { params: Promise<{ id: string }> };

// Issues a short-lived, room-scoped audio token after the membership, room-state and role checks
// in lib/rooms.ts. The request carries no role: listener, speaker or host is decided by the server.
export async function POST(_request: Request, { params }: Params) {
  const { viewer, response } = await apiMember("join a room");
  if (response) return response;
  const { id } = await params;
  if (consume(`roomjoin:${viewer.id}`, 30, 10 * 60 * 1000).limited) return NextResponse.json({ error: "Too many attempts. Please wait a moment." }, { status: 429 });

  const result = await joinRoom(id, viewer);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ token: result.token, url: result.url, role: result.role });
}
