import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field } from "@/components/ActionForm";
import { supportEnquiryAction } from "@/lib/actions/support";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Partnership and in-kind support", description: "Talk to NBM about a company or government partnership, a pledge, or support in kind such as equipment, computing, lab access or professional time." };

export default async function EnquiryPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const { campaign: campaignId } = await searchParams;
  const campaign = campaignId ? await prisma.campaign.findFirst({ where: { id: campaignId, status: "OPEN" }, select: { id: true, title: true } }) : null;
  return (
    <section className="page-section accent-sponsorship">
      <div className="shell narrow">
        <p className="breadcrumb"><Link href="/sponsorship">Sponsorship</Link> / Enquiry</p>
        <h1>Partnership and in-kind support</h1>
        <p className="lede">For companies, government agencies, foundations and individuals who want to fund a cohort or challenge, make a pledge, or offer equipment, computing, lab access or professional time.</p>
        {campaign && <div className="notice"><p>About the campaign: <strong>{campaign.title}</strong></p></div>}
        <div className="panel">
          <ActionForm action={supportEnquiryAction} submitLabel="Send enquiry" hideOnSuccess>
            {campaign && <input type="hidden" name="campaignId" value={campaign.id} />}
            <Field name="kind" label="Kind of support" type="select" required options={[{ value: "PARTNERSHIP", label: "Company, foundation or government partnership" }, { value: "IN_KIND", label: "In-kind support (equipment, computing, lab access, time)" }, { value: "PLEDGE", label: "A pledge of funds" }]} />
            <Field name="organisation" label="Organisation" required full={false} />
            <Field name="contactName" label="Your name" required full={false} autoComplete="name" />
            <Field name="email" label="Email" type="email" required autoComplete="email" />
            <Field name="details" label="What do you have in mind?" type="textarea" rows={5} required />
            <Field name="estimatedValue" label="Approximate value or quantity" hint="For example '2 laptops' or 'about NGN 500,000'. It is recorded separately from cash received." />
          </ActionForm>
        </div>
        <p className="muted small mt-2">Enquiries, pledges and offers are reviewed by our team. They are never shown as money received.</p>
      </div>
    </section>
  );
}
