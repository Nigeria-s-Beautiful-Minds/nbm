import { NextResponse } from "next/server";
import { roomState } from "@/lib/rooms";
import { getViewer } from "@/lib/viewer";

type Params = { params: Promise<{ id: string }> };

// Anyone can see who is in a live room. Nothing is recorded by reading it.
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const state = await roomState(id, await getViewer(), false);
  if (!state) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  return NextResponse.json(state);
}

// Sent every few seconds by someone who is in the room: keeps them counted as present.
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const state = await roomState(id, await getViewer(), true);
  if (!state) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  return NextResponse.json(state);
}
