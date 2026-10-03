// Phase 10 gate, against the development sandbox provider through the real webhook endpoint:
// success, failure, cancellation, duplicate webhook, delayed confirmation, refund, currency and
// amount mismatch, bad signature, and donor privacy.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { campaignTotals, createCheckout, signSandboxPayload } from "../lib/payments";
import { recordDisbursement } from "../lib/sponsorship";
import { BASE, RUN, api, cleanup, makeUser, prisma, type TestUser } from "./helpers";

let owner: TestUser, finance: TestUser, campaignId = "", slug = "";
let eventCounter = 0;

function webhook(event: Record<string, unknown>, signature?: string) {
  const body = JSON.stringify(event);
  return fetch(`${BASE}/api/payments/webhook/devsandbox`, { method: "POST", headers: { "Content-Type": "application/json", "x-nbm-signature": signature ?? signSandboxPayload(body) }, body });
}

async function checkout(amountMinor: number, extra: Partial<Parameters<typeof createCheckout>[0]> = {}) {
  const result = await createCheckout({ campaignId, amountMinor, currency: "NGN", donorEmail: `${RUN}-donor${++eventCounter}@test.nbm.local`, donorName: "Private Donor", showPublicly: false, userId: null, ...extra });
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result.reference;
}

const success = (reference: string, amountMinor: number, overrides: Record<string, unknown> = {}) => ({ id: `evt_${RUN}_${++eventCounter}`, kind: "success", reference, transactionId: `txn_${reference}`, amountMinor, currency: "NGN", feeMinor: 1500, ...overrides });
const status = async (reference: string) => (await prisma.contribution.findUniqueOrThrow({ where: { reference } })).status;

before(async () => {
  [owner, finance] = await Promise.all([makeUser("owner"), makeUser("finance", ["FINANCE"])]);
  slug = `${RUN}-campaign`;
  const campaign = await prisma.campaign.create({ data: { slug, requesterId: owner.id, title: "Payment test campaign", kind: "PROJECT", purpose: "p", team: "t", beneficiaries: "b", budget: "b", currency: "NGN", targetMinor: BigInt(10_000_000), status: "OPEN", targetPolicy: "Test policy for a missed or exceeded target." } });
  campaignId = campaign.id;
});
after(cleanup);

test("a checkout stays pending until the provider confirms; the return page proves nothing", async () => {
  const reference = await checkout(100_000);
  assert.equal(await status(reference), "PENDING");
  const page = await (await api(null, `/get-involved/contribute/return?reference=${reference}`)).text();
  assert.ok(page.includes("Waiting for confirmation"));
  assert.equal((await campaignTotals(campaignId)).receivedMinor, 0, "nothing is counted before confirmation");
});

test("success: one transaction makes one contribution and one acknowledgement, however often the webhook repeats", async () => {
  const reference = await checkout(250_000);
  const event = success(reference, 250_000);
  const first = await (await webhook(event)).json();
  assert.equal(first.outcome, "succeeded");
  // The provider retries the same event, and also sends a second event for the same transaction.
  assert.equal((await (await webhook(event)).json()).outcome, "duplicate");
  assert.equal((await (await webhook(event)).json()).outcome, "duplicate");
  assert.equal((await (await webhook(success(reference, 250_000))).json()).outcome, "already-succeeded");

  const row = await prisma.contribution.findUniqueOrThrow({ where: { reference } });
  assert.equal(row.status, "SUCCEEDED");
  assert.equal(Number(row.feeMinor), 1500);
  assert.equal((await campaignTotals(campaignId)).receivedMinor, 250_000);
  assert.equal(await prisma.emailOutbox.count({ where: { toEmail: row.donorEmail, kind: "payment-acknowledgement" } }), 1);
});

test("a bad signature, a wrong amount and a wrong currency never count", async () => {
  const reference = await checkout(300_000);
  assert.equal((await webhook(success(reference, 300_000), "0".repeat(64))).status, 401);
  assert.equal(await status(reference), "PENDING");

  assert.equal((await (await webhook(success(reference, 100))).json()).outcome, "amount-mismatch");
  assert.equal(await status(reference), "DISPUTED");

  const other = await checkout(300_000);
  assert.equal((await (await webhook(success(other, 300_000, { currency: "USD" }))).json()).outcome, "currency-mismatch");
  assert.equal(await status(other), "DISPUTED");
  assert.equal((await campaignTotals(campaignId)).receivedMinor, 250_000, "totals unchanged");

  const wrongCurrency = await createCheckout({ campaignId, amountMinor: 100_000, currency: "USD", donorEmail: `${RUN}-x@test.nbm.local`, donorName: null, showPublicly: false, userId: null });
  assert.equal(wrongCurrency.ok, false);
  assert.equal((await (await webhook(success("nbm_unknown_reference", 100))).json()).outcome, "unknown-reference");
});

test("failure and cancellation are not counted; a late success after a failure is", async () => {
  const cancelled = await checkout(120_000);
  assert.equal(await status(cancelled), "PENDING", "a customer who closes the page leaves it pending");
  const failed = await checkout(120_000);
  assert.equal((await (await webhook({ ...success(failed, 120_000), kind: "failed" })).json()).outcome, "failed");
  assert.equal(await status(failed), "FAILED");
  assert.equal((await campaignTotals(campaignId)).receivedMinor, 250_000);
  // Delayed, out-of-order confirmation: the provider reports success after an earlier failure.
  assert.equal((await (await webhook(success(failed, 120_000))).json()).outcome, "succeeded");
  assert.equal((await campaignTotals(campaignId)).receivedMinor, 370_000);
});

test("a refund comes off the public total, and a late success can't undo it", async () => {
  const reference = await checkout(200_000);
  await webhook(success(reference, 200_000));
  assert.equal((await campaignTotals(campaignId)).receivedMinor, 570_000);
  const refund = { ...success(reference, 200_000), kind: "refunded" };
  assert.equal((await (await webhook(refund)).json()).outcome, "refunded");
  assert.equal(await status(reference), "REFUNDED");
  assert.equal((await campaignTotals(campaignId)).receivedMinor, 370_000);
  assert.equal((await (await webhook(success(reference, 200_000))).json()).outcome, "no-change");
  assert.equal(await status(reference), "REFUNDED");
});

test("donors are private unless they opt in, and only finance staff can record a release", async () => {
  const named = await checkout(100_000, { donorName: "Public Supporter", showPublicly: true });
  await webhook(success(named, 100_000));
  const page = await (await api(null, `/sponsorship/${slug}`)).text();
  assert.ok(page.includes("Public Supporter"));
  assert.ok(!page.includes("Private Donor"), "donors who didn't opt in are never named");
  assert.ok(!page.includes("@test.nbm.local"), "donor emails are never public");

  const totals = await campaignTotals(campaignId);
  assert.equal((await recordDisbursement(owner.viewer, campaignId, null, 1000, "Trying to pay myself")).ok, false);
  assert.equal((await recordDisbursement(finance.viewer, campaignId, null, 1000, "")).ok, false, "a note is required");
  assert.equal((await recordDisbursement(finance.viewer, campaignId, null, totals.receivedMinor + 1, "Too much")).ok, false, "can't release more than was received");
  assert.ok((await recordDisbursement(finance.viewer, campaignId, null, 100_000, "First release against receipts")).ok);
  assert.equal((await campaignTotals(campaignId)).disbursedMinor, 100_000);
  assert.equal((await api(owner, "/admin/sponsorship")).status, 404);
});

test("pledges and in-kind offers never change received totals", async () => {
  const before = (await campaignTotals(campaignId)).receivedMinor;
  await prisma.supportEnquiry.create({ data: { kind: "PLEDGE", organisation: "Test Org", contactName: "T", email: `${RUN}-pledge@test.nbm.local`, details: "We pledge a large amount", estimatedValue: "NGN 5,000,000", campaignId, status: "ACCEPTED" } });
  assert.equal((await campaignTotals(campaignId)).receivedMinor, before);
  await prisma.supportEnquiry.deleteMany({ where: { email: { startsWith: RUN } } });
});
