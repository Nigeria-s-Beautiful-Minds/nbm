import type { Metadata } from "next";
import Link from "next/link";
import { FundingBar, PageHero } from "@/components/cards";
import { CAMPAIGN_KINDS, formatDate } from "@/lib/constants";
import { listOpenCampaigns } from "@/lib/sponsorship";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = {
  title: "Sponsorship",
  description: "Support vetted Nigerian research and innovation projects, student placements and cohorts, with clear budgets, milestones and reporting."
};

export default async function SponsorshipPage() {
  const [campaigns, viewer] = await Promise.all([listOpenCampaigns(), getViewer()]);
  return (
    <div className="accent-sponsorship">
      <PageHero accent="accent-sponsorship" kicker="Sponsorship" title="Make useful work possible.">
        <p className="lede">Back a specific project, cohort or student placement. Every campaign here has been reviewed by our team and shows its purpose, budget, milestones and what has actually been received.</p>
        <div className="button-row">
          <Link className="button" href={viewer ? "/sponsorship/request" : "/login?callbackUrl=/sponsorship/request"}>Request support for a project</Link>
          <Link className="button secondary" href="/sponsorship/enquiry">Partnership or in-kind support</Link>
        </div>
      </PageHero>

      <section className="page-section tight">
        <div className="shell">
          <div className="section-head"><h2>Approved campaigns</h2></div>
          {campaigns.length === 0 ? (
            <div className="empty-state">
              <h3>No campaigns are open yet</h3>
              <p>Campaigns appear here once a project&rsquo;s budget and plan have been reviewed. In the meantime you can support the general programme or talk to us about a partnership.</p>
              <p className="button-row" style={{ justifyContent: "center" }}>
                <Link className="button" href="/get-involved/contribute">Support the general programme</Link>
                <Link className="button secondary" href="/sponsorship/enquiry">Send an enquiry</Link>
              </p>
            </div>
          ) : (
            <div className="grid cols-3">
              {campaigns.map((c) => (
                <article key={c.id} className="card linked top-accent">
                  <div className="card-body">
                    <div className="tags"><span className="tag">{CAMPAIGN_KINDS[c.kind] ?? c.kind}</span></div>
                    <h3><Link href={`/sponsorship/${c.slug}`}>{c.title}</Link></h3>
                    <p className="clamp-3">{c.purpose}</p>
                    <FundingBar receivedMinor={c.totals.receivedMinor} targetMinor={c.targetMinor} currency={c.currency} />
                    <p className="card-meta">{c.deadline ? <span>Closes {formatDate(c.deadline)}</span> : <span>No closing date</span>}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="page-section tight tinted">
        <div className="shell">
          <div className="grid cols-3">
            <div><h3>Reviewed before it opens</h3><p>Our team checks each request&rsquo;s eligibility, team and budget, and records what happens if the target is missed or exceeded, before any contribution is taken.</p></div>
            <div><h3>Verified totals only</h3><p>Totals show money our payment provider has confirmed, less any refunds. Pledges and in-kind offers are recorded separately and never counted as cash.</p></div>
            <div><h3>Released against milestones</h3><p>Funds are released by our finance team after milestone evidence is reviewed. Sponsorship never buys selection, research conclusions or equity.</p></div>
          </div>
        </div>
      </section>
    </div>
  );
}
