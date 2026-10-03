import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field } from "@/components/ActionForm";
import { VerifyNotice } from "@/components/VerifyNotice";
import { campaignRequestAction } from "@/lib/actions/support";
import { CAMPAIGN_KINDS } from "@/lib/constants";
import { PAYMENT_CURRENCY } from "@/lib/payments";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Request support", robots: { index: false } };

export default async function RequestSupportPage() {
  const viewer = await requireViewer("/sponsorship/request");
  return (
    <section className="page-section accent-sponsorship">
      <div className="shell narrow">
        <p className="breadcrumb"><Link href="/sponsorship">Sponsorship</Link> / Request support</p>
        <h1>Request support for a project</h1>
        <p className="lede">Tell us what you need and what it will achieve. Our team reviews eligibility and budget before anything is published, and may come back with questions.</p>
        <div className="notice"><p>Submitting a request does not guarantee funding. Approved campaigns release money against milestones, after our finance team reviews the evidence.</p></div>
        {!viewer.emailVerified ? <VerifyNotice what="request support" /> : (
          <div className="panel">
            <ActionForm action={campaignRequestAction} submitLabel="Submit for review" pendingLabel="Submitting…">
              <Field name="title" label="Title" required maxLength={140} />
              <Field name="kind" label="What is the support for?" type="select" required options={Object.entries(CAMPAIGN_KINDS).map(([value, label]) => ({ value, label }))} />
              <Field name="purpose" label="The problem and what this will make possible" type="textarea" rows={5} required />
              <Field name="team" label="Team" type="textarea" rows={2} required hint="Who is doing the work, and who supervises it?" />
              <Field name="beneficiaries" label="Intended beneficiaries" type="textarea" rows={2} required />
              <Field name="budget" label="Budget" type="textarea" rows={4} required hint="List the main costs, from current local quotations where you can." />
              <Field name="target" label={`Funding target (${PAYMENT_CURRENCY})`} required full={false} placeholder="e.g. 3000000" />
              <Field name="deadline" label="Closing date" type="date" full={false} />
              {[1, 2, 3, 4].map((n) => (
                <div className="full form-grid" key={n}>
                  <Field name={`milestone${n}`} label={`Milestone ${n}`} required={n === 1} full={false} placeholder={n === 1 ? "e.g. Sensors purchased and installed" : ""} />
                  <Field name={`milestone${n}Amount`} label={`Amount (${PAYMENT_CURRENCY})`} required={n === 1} full={false} />
                </div>
              ))}
            </ActionForm>
          </div>
        )}
      </div>
    </section>
  );
}
