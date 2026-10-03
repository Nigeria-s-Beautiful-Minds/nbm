import { NextResponse } from "next/server";
import { saveExhibition } from "@/lib/exhibitions";
import { consume } from "@/lib/rate-limit";
import { apiMember } from "@/lib/viewer";

const POST_LIMIT = 10;
const POST_WINDOW_MS = 60 * 60 * 1000;

// Creates a post (as a draft, or submitted for review). Later saves go to PATCH /api/exhibitions/[id],
// so retrying after a failed upload updates the same post instead of creating another.
export async function POST(request: Request) {
  const { viewer, response } = await apiMember("share a project");
  if (response) return response;

  if (consume(`exhpost:${viewer.id}`, POST_LIMIT, POST_WINDOW_MS).limited) {
    return NextResponse.json({ error: "You're posting too quickly. Please try again shortly." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const result = await saveExhibition(viewer, null, body, body?.intent === "submit" ? "submit" : "draft");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  return NextResponse.json(result, { status: 201 });
}
