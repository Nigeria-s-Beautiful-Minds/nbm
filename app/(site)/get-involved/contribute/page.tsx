import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/cards";
import { ContributeForm } from "@/components/ContributeForm";
import { PAYMENT_CURRENCY, paymentAvailability } from "@/lib/payments";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Contribute", description: "Support the NBM general programme with a one-time contribution." };

export default async function ContributePage() {
  const [availability, viewer] = await Promise.all([paymentAvailability(), getViewer()]);
  return (
    <div className="accent-involved">
      <PageHero accent="accent-involved" kicker="Get Involved" title="Contribute">
        <p className="lede">A contribution to the general programme supports the work that isn&rsquo;t tied to one project: coordination and mentor support, data and access support for participants, community sessions, and keeping the platform running.</p>
      </PageHero>
      <section className="page-section tight">
        <div className="shell split">
          <div>
            <h2>How contributions are handled</h2>
            <ul>
              <li>Contributions here go to the general programme. To fund a specific project, cohort or placement, choose a campaign in <Link href="/sponsorship">Sponsorship</Link>.</li>
              <li>Payments are taken on our payment provider&rsquo;s secure page. NBM never sees or stores card details.</li>
              <li>You receive an emailed acknowledgement once the provider confirms the payment.</li>
              <li>An acknowledgement is not a tax receipt, and we make no claim about tax deductibility.</li>
              <li>We offer one-time contributions for now.</li>
            </ul>
            <p>Offering equipment, lab access, computing or professional time instead? <Link href="/sponsorship/enquiry">Tell us about it</Link>.</p>
          </div>
          <div className="panel">
            <h2>Make a contribution</h2>
            <ContributeForm availability={availability} currency={PAYMENT_CURRENCY} defaultEmail={viewer?.email} defaultName={viewer?.name} />
          </div>
        </div>
      </section>
    </div>
  );
}
