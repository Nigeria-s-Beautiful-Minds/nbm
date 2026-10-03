// One contribution system for the whole site. "Contribute" (general fund) and "Sponsorship"
// (a specific campaign) both create a Contribution here and differ only in campaignId.
//
// Trust model: the browser never tells us a payment succeeded. A Contribution becomes SUCCEEDED
// only when the provider's signed webhook arrives and its amount and currency match what we
// asked for. Every webhook is stored once per provider event id, so retries change nothing.
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { baseUrl, getSetting, isProductionStage } from "@/lib/config";
import { formatMoney } from "@/lib/constants";
import { queueEmail, deliverEmail, renderEmail } from "@/lib/mailer";
import { randomToken, safeEqual } from "@/lib/tokens";

export type ProviderName = "none" | "devsandbox" | "paystack";

export const PAYMENT_CURRENCY = (process.env.PAYMENT_CURRENCY || "NGN").toUpperCase();
export const MIN_CONTRIBUTION_MINOR = 50_000; // 500.00 in the payment currency
export const MAX_CONTRIBUTION_MINOR = 5_000_000_000;

export function configuredProvider(): ProviderName {
  const name = (process.env.PAYMENT_PROVIDER || "none").toLowerCase();
  // The sandbox moves no money and must never be reachable on a production deployment.
  if (name === "devsandbox") return !isProductionStage && process.env.DEV_PAYMENT_WEBHOOK_SECRET ? "devsandbox" : "none";
  if (name === "paystack") return process.env.PAYSTACK_SECRET_KEY ? "paystack" : "none";
  return "none";
}

export type PaymentAvailability = { enabled: boolean; provider: ProviderName; testMode: boolean; reason?: string };

/** Whether the site may take contributions right now. Real money also needs the founder's recorded sign-off. */
export async function paymentAvailability(): Promise<PaymentAvailability> {
  const provider = configuredProvider();
  if (provider === "none") return { enabled: false, provider, testMode: false, reason: "Online contributions are not live yet." };
  if (provider === "devsandbox") return { enabled: true, provider, testMode: true };
  const confirmed = await getSetting<boolean>("paymentsLiveConfirmed", false);
  return confirmed ? { enabled: true, provider, testMode: false } : { enabled: false, provider, testMode: false, reason: "Online contributions are not live yet." };
}

// ── Checkout ──

export type CheckoutInput = { campaignId: string | null; amountMinor: number; currency: string; donorEmail: string; donorName: string | null; showPublicly: boolean; userId: string | null };

export async function createCheckout(input: CheckoutInput): Promise<{ ok: true; url: string; reference: string } | { ok: false; error: string }> {
  const availability = await paymentAvailability();
  if (!availability.enabled) return { ok: false, error: availability.reason || "Online contributions are not live yet." };
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < MIN_CONTRIBUTION_MINOR || input.amountMinor > MAX_CONTRIBUTION_MINOR) {
    return { ok: false, error: `Please enter an amount of at least ${formatMoney(MIN_CONTRIBUTION_MINOR, input.currency)}.` };
  }

  // The destination and currency are decided here, never taken on trust from the form.
  let currency = PAYMENT_CURRENCY;
  if (input.campaignId) {
    const campaign = await prisma.campaign.findUnique({ where: { id: input.campaignId }, select: { status: true, currency: true, deadline: true } });
    if (!campaign || campaign.status !== "OPEN") return { ok: false, error: "This campaign isn't open for contributions." };
    if (campaign.deadline && campaign.deadline < new Date()) return { ok: false, error: "This campaign's deadline has passed." };
    currency = campaign.currency;
  }
  if (input.currency.toUpperCase() !== currency) return { ok: false, error: `Contributions here are taken in ${currency}.` };

  const reference = `nbm_${randomToken(12)}`;
  const contribution = await prisma.contribution.create({
    data: {
      campaignId: input.campaignId, amountMinor: BigInt(input.amountMinor), currency, provider: availability.provider, reference,
      donorEmail: input.donorEmail, donorName: input.donorName, showPublicly: input.showPublicly, userId: input.userId
    }
  });

  const callbackUrl = `${baseUrl()}/get-involved/contribute/return?reference=${reference}`;
  try {
    let url: string;
    if (availability.provider === "paystack") {
      const res = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: input.donorEmail, amount: input.amountMinor, currency, reference, callback_url: callbackUrl, metadata: { contributionId: contribution.id } })
      });
      const data = await res.json();
      if (!res.ok || !data?.status || !data.data?.authorization_url) throw new Error(data?.message || "Provider refused the checkout.");
      url = data.data.authorization_url;
    } else {
      url = `${baseUrl()}/checkout/sandbox/${reference}`;
    }
    await prisma.contribution.update({ where: { id: contribution.id }, data: { status: "PENDING" } });
    return { ok: true, url, reference };
  } catch (err) {
    console.error("createCheckout failed:", err instanceof Error ? err.message : err);
    await prisma.contribution.update({ where: { id: contribution.id }, data: { status: "FAILED" } });
    return { ok: false, error: "We couldn't reach the payment provider. No money was taken. Please try again." };
  }
}

// ── Webhooks ──

export type PaymentEventKind = "success" | "failed" | "refunded" | "disputed";

export type NormalizedEvent = {
  eventId: string;
  kind: PaymentEventKind;
  reference: string;
  transactionId: string;
  amountMinor: number;
  currency: string;
  feeMinor: number | null;
  raw: Prisma.InputJsonValue;
};

export function signSandboxPayload(body: string): string {
  return crypto.createHmac("sha256", process.env.DEV_PAYMENT_WEBHOOK_SECRET || "").update(body).digest("hex");
}

/**
 * Checks the webhook's signature against the raw body and turns it into our own event shape.
 * Returns null when the signature is wrong; "ignored" for event types we don't act on.
 */
export function parseWebhook(provider: ProviderName, rawBody: string, headers: Headers): NormalizedEvent | "ignored" | null {
  if (provider === "devsandbox") {
    if (configuredProvider() !== "devsandbox") return null;
    if (!safeEqual(signSandboxPayload(rawBody), headers.get("x-nbm-signature") || "")) return null;
    const e = JSON.parse(rawBody);
    if (!["success", "failed", "refunded", "disputed"].includes(e.kind)) return "ignored";
    return { eventId: String(e.id), kind: e.kind, reference: String(e.reference), transactionId: String(e.transactionId), amountMinor: Number(e.amountMinor), currency: String(e.currency), feeMinor: e.feeMinor == null ? null : Number(e.feeMinor), raw: e };
  }
  if (provider === "paystack") {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return null;
    const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
    if (!safeEqual(expected, headers.get("x-paystack-signature") || "")) return null;
    const e = JSON.parse(rawBody);
    const data = e?.data ?? {};
    const kinds: Record<string, PaymentEventKind> = { "charge.success": "success", "refund.processed": "refunded", "charge.dispute.create": "disputed" };
    const kind = kinds[e?.event];
    if (!kind) return "ignored";
    // Refund and dispute payloads describe the original transaction under different keys.
    const reference = String(data.reference ?? data.transaction_reference ?? data.transaction?.reference ?? "");
    const transactionId = String(kind === "success" ? data.id : data.transaction?.id ?? data.transaction_reference ?? data.id);
    // Paystack has no event id; the event type plus the object's id is stable across retries.
    return { eventId: `${e.event}:${data.id}`, kind, reference, transactionId, amountMinor: Number(data.amount), currency: String(data.currency ?? "").toUpperCase(), feeMinor: data.fees == null ? null : Number(data.fees), raw: e };
  }
  return null;
}

export type EventOutcome = "duplicate" | "unknown-reference" | "succeeded" | "already-succeeded" | "amount-mismatch" | "currency-mismatch" | "failed" | "refunded" | "disputed" | "no-change";

/**
 * Applies one verified provider event. Safe to call any number of times and in any order:
 *  - a repeated event id is stored once and otherwise ignored;
 *  - a success only counts if the amount and currency are exactly what we asked for;
 *  - a success can't overwrite a refund or dispute that arrived first;
 *  - the acknowledgement email is queued once per contribution, in the same transaction.
 */
export async function processPaymentEvent(provider: ProviderName, event: NormalizedEvent): Promise<EventOutcome> {
  let acknowledgementId: string | null = null;
  let outcome: EventOutcome;
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const contribution = await tx.contribution.findUnique({ where: { reference: event.reference }, include: { campaign: { select: { title: true } } } });
      const record = (result: EventOutcome) =>
        tx.paymentEvent.create({ data: { provider, eventId: event.eventId, type: event.kind, contributionId: contribution?.provider === provider ? contribution.id : null, outcome: result, payload: event.raw } });

      // The unique (provider, eventId) index makes this insert the deduplication point.
      if (!contribution || contribution.provider !== provider) { await record("unknown-reference"); return "unknown-reference"; }
      // Take the row lock so two different events for the same contribution apply one after the other.
      await tx.$queryRaw`SELECT 1 FROM "Contribution" WHERE "id" = ${contribution.id} FOR UPDATE`;
      const current = await tx.contribution.findUniqueOrThrow({ where: { id: contribution.id } });
      let result: EventOutcome = "no-change";

      if (event.kind === "success") {
        if (current.status === "SUCCEEDED") result = "already-succeeded";
        else if (!["INITIATED", "PENDING", "FAILED"].includes(current.status)) result = "no-change";
        else if (event.currency.toUpperCase() !== current.currency) {
          result = "currency-mismatch";
          await tx.contribution.update({ where: { id: current.id }, data: { status: "DISPUTED" } });
        } else if (BigInt(event.amountMinor) !== current.amountMinor) {
          result = "amount-mismatch";
          await tx.contribution.update({ where: { id: current.id }, data: { status: "DISPUTED" } });
        } else {
          result = "succeeded";
          await tx.contribution.update({ where: { id: current.id }, data: { status: "SUCCEEDED", providerTransactionId: event.transactionId, feeMinor: event.feeMinor == null ? null : BigInt(event.feeMinor), acknowledgedAt: new Date() } });
          acknowledgementId = await queueEmail(tx, {
            to: current.donorEmail,
            kind: "payment-acknowledgement",
            dedupeKey: `contribution-ack:${current.id}`,
            subject: "Thank you for your contribution to Nigeria's Beautiful Minds",
            html: renderEmail({
              heading: "We received your contribution",
              paragraphs: [
                `Thank you${current.donorName ? `, ${current.donorName}` : ""}. We have received ${formatMoney(current.amountMinor, current.currency)} for ${contribution.campaign ? `the campaign "${contribution.campaign.title}"` : "the NBM general programme"}.`,
                `Reference: ${current.reference}`,
                "This message acknowledges your payment. It is not a tax receipt, and NBM makes no claim about tax deductibility."
              ]
            })
          });
        }
      } else if (event.kind === "failed") {
        if (["INITIATED", "PENDING"].includes(current.status)) { result = "failed"; await tx.contribution.update({ where: { id: current.id }, data: { status: "FAILED" } }); }
      } else if (event.kind === "refunded") {
        // Money that went back is taken out of the totals. A partial refund keeps the rest counted.
        const refunded = BigInt(Math.min(event.amountMinor, Number(current.amountMinor)));
        result = "refunded";
        await tx.contribution.update({ where: { id: current.id }, data: { refundedMinor: refunded, status: refunded >= current.amountMinor ? "REFUNDED" : current.status } });
      } else if (event.kind === "disputed") {
        result = "disputed";
        await tx.contribution.update({ where: { id: current.id }, data: { status: "DISPUTED" } });
      }
      await record(result);
      return result;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "duplicate";
    throw err;
  }
  if (acknowledgementId) await deliverEmail(acknowledgementId).catch(() => undefined);
  return outcome;
}

// ── Totals ──

export type FundTotals = { receivedMinor: number; disbursedMinor: number; contributions: number };

/**
 * Verified money only: succeeded contributions, less anything refunded. Pledges and in-kind
 * offers are never included. Each total is in a single currency.
 */
export async function campaignTotals(campaignId: string): Promise<FundTotals> {
  const [rows, disbursed] = await Promise.all([
    prisma.contribution.findMany({ where: { campaignId, status: { in: ["SUCCEEDED", "REFUNDED"] } }, select: { amountMinor: true, refundedMinor: true, status: true } }),
    prisma.disbursement.aggregate({ where: { campaignId }, _sum: { amountMinor: true } })
  ]);
  return {
    receivedMinor: rows.reduce((sum, row) => sum + Number(row.amountMinor - row.refundedMinor), 0),
    disbursedMinor: Number(disbursed._sum.amountMinor ?? 0),
    contributions: rows.filter((row) => row.status === "SUCCEEDED").length
  };
}

/** General-fund totals, one entry per currency: different currencies are never added together. */
export async function generalFundTotals(): Promise<{ currency: string; receivedMinor: number }[]> {
  const rows = await prisma.contribution.findMany({ where: { campaignId: null, status: { in: ["SUCCEEDED", "REFUNDED"] } }, select: { amountMinor: true, refundedMinor: true, currency: true } });
  const byCurrency = new Map<string, number>();
  for (const row of rows) byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + Number(row.amountMinor - row.refundedMinor));
  return [...byCurrency.entries()].map(([currency, receivedMinor]) => ({ currency, receivedMinor }));
}
