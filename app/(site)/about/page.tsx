import type { Metadata } from "next";
import Link from "next/link";
import { SitePageView } from "@/components/SitePageView";
import { optimaisRelationshipConfirmed } from "@/lib/config";

export const metadata: Metadata = {
  title: "About us",
  description: "The mission and vision of Nigeria's Beautiful Minds: a Nigeria-first community for research, innovation and collaboration."
};

export default async function AboutPage() {
  const confirmed = await optimaisRelationshipConfirmed();
  return (
    <SitePageView slug="about" kicker="About" fallbackTitle="About Nigeria's Beautiful Minds">
      {/* Shown only once the founder has confirmed the arrangement in the staff settings. */}
      {confirmed && <p className="mt-3"><strong>Nigeria&rsquo;s Beautiful Minds is an initiative of Optimais Labs.</strong></p>}
      <div className="grid cols-4 mt-3">
        {[
          ["/exhibitions", "accent-exhibitions", "Exhibitions", "Discover a project and the people behind it."],
          ["/discussion", "accent-discussion", "Discussion", "Join its conversation, in text or live audio."],
          ["/mentorship", "accent-mentorship", "Mentorship", "Form a supervised team with a verified mentor."],
          ["/sponsorship", "accent-sponsorship", "Sponsorship", "Seek or give approved support, tied to milestones."]
        ].map(([href, accent, title, body]) => (
          <article key={href} className={`card linked top-accent ${accent}`}>
            <div className="card-body"><h3><Link href={href}>{title}</Link></h3><p>{body}</p></div>
          </article>
        ))}
      </div>
      <p className="mt-3"><Link href="/about/team">Meet the team</Link> · <Link href="/about/news">Read our news</Link> · <Link href="/community-standards">Community standards</Link> · <Link href="/get-involved/contact">Contact us</Link></p>
    </SitePageView>
  );
}
