import { NextResponse } from "next/server";
import { configuredProvider, parseWebhook, processPaymentEvent, type ProviderName } from "@/lib/payments";

type Params = { params: Promise<{ provider: string }> };

// The only place a contribution can become SUCCEEDED, REFUNDED or DISPUTED. The signature is
// checked against the raw body before anything is parsed or stored.
export async function POST(request: Request, { params }: Params) {
  const { provider } = await params;
  if (provider !== configuredProvider()) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const rawBody = await request.text();
  let event;
  try {
    event = parseWebhook(provider as ProviderName, rawBody, request.headers);
  } catch {
    return NextResponse.json({ error: "Malformed payload." }, { status: 400 });
  }
  if (event === null) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  if (event === "ignored") return NextResponse.json({ ok: true, outcome: "ignored" });

  try {
    const outcome = await processPaymentEvent(provider as ProviderName, event);
    // 200 for duplicates too, so the provider stops retrying something we already have.
    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    console.error("payment webhook failed:", err instanceof Error ? err.message : err);
    // A 500 asks the provider to retry later; the event id makes that safe.
    return NextResponse.json({ error: "Temporary failure." }, { status: 500 });
  }
}
