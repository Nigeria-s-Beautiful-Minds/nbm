import Link from "next/link";
import { ActionForm, Field } from "@/components/ActionForm";
import { approveMilestoneAction, disbursementAction, enquiryStatusAction, reviewCampaignAction } from "@/lib/actions/support";
import { formatDate, formatMoney } from "@/lib/constants";
import { campaignTotals, generalFundTotals, paymentAvailability } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/viewer";

export const metadata = { title: "Sponsorship and finance" };

export default async function AdminSponsorshipPage() {
  await requireCapability("finance.manage", "/admin/sponsorship");
  const [availability, requests, live, contributions, enquiries, general, events] = await Promise.all([
    paymentAvailability(),
    prisma.campaign.findMany({ where: { status: { in: ["SUBMITTED", "REVIEWING"] } }, orderBy: { createdAt: "asc" }, include: { requester: { select: { name: true, email: true } }, milestones: { orderBy: { sortOrder: "asc" } } } }),
    prisma.campaign.findMany({ where: { status: { in: ["OPEN", "CLOSED"] } }, orderBy: { createdAt: "desc" }, include: { milestones: { orderBy: { sortOrder: "asc" } }, disbursements: { orderBy: { createdAt: "desc" } } } }),
    prisma.contribution.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { campaign: { select: { title: true } } } }),
    prisma.supportEnquiry.findMany({ where: { status: { in: ["NEW", "REVIEWING"] } }, orderBy: { createdAt: "asc" }, include: { campaign: { select: { title: true } } } }),
    generalFundTotals(),
    prisma.paymentEvent.findMany({ where: { outcome: { in: ["amount-mismatch", "currency-mismatch", "unknown-reference", "disputed"] } }, orderBy: { createdAt: "desc" }, take: 20 })
  ]);
  const totals = new Map(await Promise.all(live.map(async (c) => [c.id, await campaignTotals(c.id)] as const)));

  return (
    <>
      <h1>Sponsorship and finance</h1>
      <div className={`notice ${availability.enabled && !availability.testMode ? "" : "warn"}`}>
        <p>
          <strong>Payments: {availability.provider === "none" ? "not configured" : availability.testMode ? "development sandbox (no real money)" : availability.enabled ? `live via ${availability.provider}` : `${availability.provider} configured but not switched on`}.</strong>{" "}
          Real contributions stay off until a provider key is set and an administrator records the founder&rsquo;s finance sign-off in Settings.
        </p>
      </div>
      <p>General programme, received: {general.length === 0 ? "nothing yet" : general.map((g) => formatMoney(g.receivedMinor, g.currency)).join(" · ")}. <span className="muted small">Each currency is totalled separately.</span></p>

      <h2 className="mt-3">Support requests to review ({requests.length})</h2>
      {requests.length === 0 ? <p className="status">Nothing waiting.</p> : (
        <div className="record-list">
          {requests.map((c) => (
            <article key={c.id} className="record">
              <div className="record-head">
                <h3><Link href={`/sponsorship/${c.slug}`}>{c.title}</Link></h3><span className="tag warn">{c.status.toLowerCase()}</span>
                <span className="muted small">{c.requester.name} · {c.requester.email}</span>
              </div>
              <dl className="facts">
                <dt>Target</dt><dd>{formatMoney(c.targetMinor, c.currency)}{c.deadline ? ` by ${formatDate(c.deadline)}` : ""}</dd>
                <dt>Purpose</dt><dd>{c.purpose}</dd>
                <dt>Team</dt><dd>{c.team}</dd>
                <dt>Budget</dt><dd>{c.budget}</dd>
                <dt>Milestones</dt><dd>{c.milestones.map((m) => `${m.title} (${formatMoney(m.amountMinor, c.currency)})`).join("; ")}</dd>
              </dl>
              <div className="record-actions">
                {c.status === "SUBMITTED" && (
                  <ActionForm action={reviewCampaignAction} submitLabel="Start review" className="inline-form" buttonClassName="button small secondary">
                    <input type="hidden" name="id" value={c.id} /><input type="hidden" name="decision" value="REVIEWING" />
                  </ActionForm>
                )}
                <ActionForm action={reviewCampaignAction} submitLabel="Approve and open" className="inline-form" buttonClassName="button small">
                  <input type="hidden" name="id" value={c.id} /><input type="hidden" name="decision" value="OPEN" />
                  <Field name="targetPolicy" label="If the target is missed or exceeded (shown publicly)" required type="textarea" rows={2} />
                </ActionForm>
                <ActionForm action={reviewCampaignAction} submitLabel="Reject" className="inline-form" buttonClassName="button small danger">
                  <input type="hidden" name="id" value={c.id} /><input type="hidden" name="decision" value="REJECTED" />
                  <Field name="reason" label="Reason" required full={false} />
                </ActionForm>
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className="mt-3">Campaigns</h2>
      {live.length === 0 ? <p className="status">No approved campaigns.</p> : (
        <div className="record-list">
          {live.map((c) => {
            const t = totals.get(c.id)!;
            return (
              <article key={c.id} className="record">
                <div className="record-head"><h3><Link href={`/sponsorship/${c.slug}`}>{c.title}</Link></h3><span className={`tag ${c.status === "OPEN" ? "ok" : "neutral"}`}>{c.status.toLowerCase()}</span></div>
                <p className="small">Received {formatMoney(t.receivedMinor, c.currency)} · released {formatMoney(t.disbursedMinor, c.currency)} · target {formatMoney(c.targetMinor, c.currency)}</p>
                {c.milestones.map((m) => (
                  <div key={m.id} className="row mt-2">
                    <span>{m.title} · {formatMoney(m.amountMinor, c.currency)} · <em>{m.status.replace(/_/g, " ").toLowerCase()}</em></span>
                    {m.status === "EVIDENCE_SUBMITTED" && (
                      <details><summary>Review evidence</summary><p className="mt-2">{m.evidence}</p>
                        <ActionForm action={approveMilestoneAction} submitLabel="Approve evidence" className="inline-form" buttonClassName="button small"><input type="hidden" name="milestoneId" value={m.id} /></ActionForm>
                      </details>
                    )}
                  </div>
                ))}
                {c.disbursements.length > 0 && <p className="small mt-2">Releases: {c.disbursements.map((d) => `${formatMoney(d.amountMinor, d.currency)} on ${formatDate(d.createdAt)} (${d.note})`).join("; ")}</p>}
                <div className="record-actions">
                  <ActionForm action={disbursementAction} submitLabel="Record release" className="inline-form" buttonClassName="button small" confirm="Record this release of funds? It should match a transfer you have made.">
                    <input type="hidden" name="campaignId" value={c.id} />
                    <Field name="milestoneId" label="Against milestone" type="select" full={false} options={c.milestones.filter((m) => m.status === "APPROVED").map((m) => ({ value: m.id, label: m.title }))} />
                    <Field name="amount" label={`Amount (${c.currency})`} required full={false} />
                    <Field name="note" label="Note (required)" required full={false} />
                  </ActionForm>
                  {c.status === "OPEN" && (
                    <ActionForm action={reviewCampaignAction} submitLabel="Close campaign" className="inline-form" buttonClassName="button small danger">
                      <input type="hidden" name="id" value={c.id} /><input type="hidden" name="decision" value="CLOSED" />
                      <Field name="reason" label="Reason" required full={false} />
                    </ActionForm>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <h2 className="mt-3">Partnership, pledge and in-kind enquiries ({enquiries.length})</h2>
      {enquiries.length === 0 ? <p className="status">No open enquiries.</p> : (
        <div className="record-list">
          {enquiries.map((e) => (
            <article key={e.id} className="record">
              <div className="record-head"><h3>{e.organisation}</h3><span className="tag neutral">{e.kind.replace("_", "-").toLowerCase()}</span><span className="muted small">{e.contactName} · {e.email} · {formatDate(e.createdAt)}</span></div>
              <p>{e.details}</p>
              {e.estimatedValue && <p className="small">Stated value: {e.estimatedValue} <span className="muted">(not counted as cash)</span></p>}
              {e.campaign && <p className="small">About: {e.campaign.title}</p>}
              <ActionForm action={enquiryStatusAction} submitLabel="Save" className="inline-form" buttonClassName="button small">
                <input type="hidden" name="id" value={e.id} />
                <Field name="status" label="Status" type="select" required full={false} defaultValue={e.status} options={["NEW", "REVIEWING", "ACCEPTED", "DECLINED"].map((s) => ({ value: s, label: s.toLowerCase() }))} />
                <Field name="notes" label="Notes" full={false} defaultValue={e.notes ?? ""} />
              </ActionForm>
            </article>
          ))}
        </div>
      )}

      <h2 className="mt-3">Contributions</h2>
      <p className="muted small">Donor details are visible to finance staff only.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Date</th><th>For</th><th>Amount</th><th>Fee</th><th>Status</th><th>Donor</th><th>Reference</th></tr></thead>
          <tbody>
            {contributions.length === 0 && <tr><td colSpan={7}>No contributions yet.</td></tr>}
            {contributions.map((c) => (
              <tr key={c.id}>
                <td>{formatDate(c.createdAt)}</td><td>{c.campaign?.title ?? "General programme"}</td>
                <td>{formatMoney(c.amountMinor, c.currency)}{c.refundedMinor > 0 ? ` (refunded ${formatMoney(c.refundedMinor, c.currency)})` : ""}</td>
                <td>{c.feeMinor == null ? "" : formatMoney(c.feeMinor, c.currency)}</td>
                <td>{c.status.toLowerCase()} · {c.provider}</td><td>{c.donorName ?? "—"} · {c.donorEmail}{c.showPublicly ? "" : " · anonymous publicly"}</td><td>{c.reference}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {events.length > 0 && (
        <>
          <h2 className="mt-3">Payment events needing attention</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Provider</th><th>Event</th><th>Outcome</th></tr></thead>
              <tbody>{events.map((e) => <tr key={e.id}><td>{formatDate(e.createdAt)}</td><td>{e.provider}</td><td>{e.eventId}</td><td>{e.outcome}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
