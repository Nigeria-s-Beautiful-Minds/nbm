"use server";

import { redirect } from "next/navigation";
import { baseUrl } from "@/lib/config";
import { configuredProvider, signSandboxPayload } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { randomToken } from "@/lib/tokens";

// Development sandbox only. Plays the part of a payment provider: it sends a signed webhook to
// our real webhook endpoint, then returns the "customer" to the real return page. It refuses to
// run unless PAYMENT_PROVIDER=devsandbox on a non-production stage.
export async function sandboxPayAction(formData: FormData): Promise<void> {
  if (configuredProvider() !== "devsandbox") throw new Error("Sandbox is not available.");
  const reference = String(formData.get("reference") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const contribution = await prisma.contribution.findUnique({ where: { reference } });
  if (!contribution || contribution.provider !== "devsandbox") throw new Error("Unknown reference.");

  if (kind === "success" || kind === "failed") {
    const body = JSON.stringify({
      id: `evt_${randomToken(8)}`, kind, reference, transactionId: `sbx_${reference}`,
      amountMinor: Number(contribution.amountMinor), currency: contribution.currency, feeMinor: kind === "success" ? Math.round(Number(contribution.amountMinor) * 0.015) : null
    });
    await fetch(`${baseUrl()}/api/payments/webhook/devsandbox`, { method: "POST", headers: { "Content-Type": "application/json", "x-nbm-signature": signSandboxPayload(body) }, body });
  }
  // "cancel" sends nothing, like a customer closing the provider's page.
  redirect(`/get-involved/contribute/return?reference=${reference}`);
}
