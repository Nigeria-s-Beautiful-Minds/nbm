import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/cards";

export const metadata: Metadata = {
  title: "Get Involved",
  description: "Contribute, volunteer, join the mailing list or contact Nigeria's Beautiful Minds."
};

const ROUTES = [
  { href: "/get-involved/contribute", title: "Contribute", body: "Support the general programme: coordination, access support and the community sessions that hold everything together.", cta: "Contribute" },
  { href: "/get-involved/volunteer", title: "Volunteer", body: "Give time to a committee: events, mentorship, outreach or project review.", cta: "Volunteer" },
  { href: "/get-involved/mailing-list", title: "Join our mailing list", body: "Occasional updates on projects, opportunities and calls for applications. Unsubscribe any time.", cta: "Subscribe" },
  { href: "/get-involved/contact", title: "Contact us", body: "Questions, ideas, partnerships or press. We read every message.", cta: "Get in touch" }
];

export default function GetInvolvedPage() {
  return (
    <div className="accent-involved">
      <PageHero accent="accent-involved" kicker="Get Involved" title="Get involved">
        <p className="lede">There are many ways to support research, innovation and the next generation of Nigerian talent.</p>
      </PageHero>
      <section className="page-section tight">
        <div className="shell">
          <div className="grid cols-2">
            {ROUTES.map((route) => (
              <article key={route.href} className="card linked top-accent">
                <div className="card-body">
                  <h2 style={{ fontSize: "1.4rem", margin: 0 }}><Link href={route.href} style={{ textDecoration: "none", color: "inherit" }}>{route.title}</Link></h2>
                  <p>{route.body}</p>
                  <p className="card-meta"><span className="section-link" aria-hidden="true">{route.cta} →</span></p>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-3">Want to back a specific project, cohort or student placement instead? See <Link href="/sponsorship">Sponsorship</Link>. Ready to share your own work? <Link href="/join">Join the community</Link>.</p>
        </div>
      </section>
    </div>
  );
}
