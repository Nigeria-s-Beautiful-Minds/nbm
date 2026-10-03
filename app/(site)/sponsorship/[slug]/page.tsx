import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field } from "@/components/ActionForm";
import { FundingBar } from "@/components/cards";
import { ContributeForm } from "@/components/ContributeForm";
import { PlainText } from "@/components/Prose";
import { campaignUpdateAction, milestoneEvidenceAction } from "@/lib/actions/support";
import { CAMPAIGN_KINDS, formatDate, formatMoney } from "@/lib/constants";
import { paymentAvailability } from "@/lib/payments";
import { getCampaign } from "@/lib/sponsorship";
import { getViewer } from "@/lib/viewer";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const found = await getCampaign(slug, null);
  return found ? { title: found.campaign.title, description: found.campaign.purpose.slice(0, 160) } : { title: "Sponsorship", robots: { index: false } };
}

const MILESTONE: Record<string, string> = { PLANNED: "Planned", EVIDENCE_SUBMITTED: "Evidence under review", APPROVED: "Evidence approved" };

export default async function CampaignPage({ params }: Params) {
  const { slug } = await params;
  const viewer = await getViewer();
  const found = await getCampaign(slug, viewer);
  if (!found) notFound();
  const { campaign: c, totals, isOwn, isPublic, supporters } = found;
  const availability = await paymentAvailability();
  const path = `/sponsorship/${c.slug}`;
  const open = c.status === "OPEN" && (!c.deadline || c.deadline > new Date());

  return (
    <section className="page-section tight accent-sponsorship">
      <div className="shell">
        <p className="breadcrumb"><Link href="/sponsorship">Sponsorship</Link> / Campaign</p>
        {!isPublic && <div className="notice warn"><p><strong>Not public.</strong> This request is {c.status.toLowerCase()}. Only you and our finance team can see it.{c.reviewNote ? ` Reviewer's note: ${c.reviewNote}` : ""}</p></div>}
        <div className="sidebar-layout">
          <article>
            <span className="tag">{CAMPAIGN_KINDS[c.kind] ?? c.kind}</span>
            <h1 className="mt-2">{c.title}</h1>
            <p className="muted">Requested by {c.requester.name}</p>
            <h2>Purpose</h2><PlainText text={c.purpose} />
            <h2>Team</h2><PlainText text={c.team} />
            <h2>Who it is intended to benefit</h2><PlainText text={c.beneficiaries} />
            <h2>Budget</h2><PlainText text={c.budget} />
            <h2>Milestones</h2>
            <div className="record-list">
              {c.milestones.map((m) => (
                <div key={m.id} className="record">
                  <div className="record-head">
                    <h3>{m.title}</h3>
                    <span className="tag neutral">{formatMoney(m.amountMinor, c.currency)}</span>
                    <span className={`tag ${m.status === "APPROVED" ? "ok" : m.status === "EVIDENCE_SUBMITTED" ? "warn" : "neutral"}`}>{MILESTONE[m.status]}</span>
                  </div>
                  {m.evidence && m.status === "APPROVED" && <PlainText text={m.evidence} />}
                  {isOwn && isPublic && m.status !== "APPROVED" && (
                    <details>
                      <summary>{m.evidence ? "Update milestone evidence" : "Submit milestone evidence"}</summary>
                      <div className="mt-2">
                        <ActionForm action={milestoneEvidenceAction} submitLabel="Submit evidence" buttonClassName="button small">
                          <input type="hidden" name="milestoneId" value={m.id} /><input type="hidden" name="path" value={path} />
                          <Field name="evidence" label="What was done, and where can it be seen?" type="textarea" rows={3} required defaultValue={m.evidence ?? ""} />
                        </ActionForm>
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
            {c.targetPolicy && (<><h2 className="mt-3">If the target is missed or exceeded</h2><PlainText text={c.targetPolicy} /></>)}

            <h2 className="mt-3">Updates</h2>
            {c.updates.length === 0 ? <p className="muted">No updates yet.</p> : c.updates.map((u) => (
              <div key={u.id} className="comment mt-2"><p className="comment-meta"><span>{formatDate(u.createdAt)}</span></p><p className="comment-body">{u.body}</p></div>
            ))}
            {isOwn && isPublic && (
              <div className="panel mt-2">
                <ActionForm action={campaignUpdateAction} submitLabel="Post update" buttonClassName="button small">
                  <input type="hidden" name="campaignId" value={c.id} /><input type="hidden" name="path" value={path} />
                  <Field name="body" label="Progress update for supporters" type="textarea" rows={3} required />
                </ActionForm>
              </div>
            )}
          </article>

          <aside className="stack">
            <div className="panel">
              <h2>Funding</h2>
              <FundingBar receivedMinor={totals.receivedMinor} targetMinor={Number(c.targetMinor)} currency={c.currency} />
              <dl className="facts mt-2">
                <dt>Received</dt><dd>{formatMoney(totals.receivedMinor, c.currency)} from {totals.contributions} contribution{totals.contributions === 1 ? "" : "s"}</dd>
                <dt>Released</dt><dd>{formatMoney(totals.disbursedMinor, c.currency)}</dd>
                <dt>Target</dt><dd>{formatMoney(c.targetMinor, c.currency)}</dd>
                <dt>Closes</dt><dd>{c.deadline ? formatDate(c.deadline) : "No closing date"}</dd>
              </dl>
              <p className="small muted mt-2 mb-0">&ldquo;Received&rdquo; is money confirmed by our payment provider, less refunds. Pledges and in-kind offers are not included.</p>
            </div>
            {open && (
              <div className="panel">
                <h2>Support this project</h2>
                <ContributeForm availability={availability} currency={c.currency} campaignId={c.id} defaultEmail={viewer?.email} defaultName={viewer?.name} />
              </div>
            )}
            {c.status === "CLOSED" && <div className="notice"><p>This campaign is closed to new contributions.</p></div>}
            {isPublic && <div className="panel"><h2>Equipment, lab time or expertise?</h2><p className="mb-0"><Link href={`/sponsorship/enquiry?campaign=${c.id}`}>Offer in-kind support or a partnership</Link>.</p></div>}
            {supporters.length > 0 && <div className="panel"><h2>Supporters</h2><p className="mb-0">{supporters.join(", ")}</p><p className="small muted mt-2 mb-0">Shown with their permission. Others gave anonymously.</p></div>}
          </aside>
        </div>
      </div>
    </section>
  );
}
