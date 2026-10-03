import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/cards";
import { FUNDING_STATUS, MENTOR_KINDS, TOPICS, WORKING_MODES } from "@/lib/constants";
import { listPublishedOpportunities } from "@/lib/mentorship";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = {
  title: "Mentorship",
  description: "Research and innovation opportunities with verified principal investigators and technical mentors. Apply, or ask a coordinator to find you a match."
};

export default async function MentorshipPage({ searchParams }: { searchParams: Promise<{ topic?: string; mode?: string }> }) {
  const params = await searchParams;
  const topic = (TOPICS as readonly string[]).includes(params.topic ?? "") ? params.topic : undefined;
  const mode = params.mode && params.mode in WORKING_MODES ? params.mode : undefined;
  const [opportunities, viewer] = await Promise.all([listPublishedOpportunities({ topic, mode }), getViewer()]);
  const href = (changes: { topic?: string; mode?: string }) => {
    const next = new URLSearchParams();
    const merged = { topic, mode, ...changes };
    if (merged.topic) next.set("topic", merged.topic);
    if (merged.mode) next.set("mode", merged.mode);
    return `/mentorship${next.size ? `?${next}` : ""}`;
  };
  const gate = (path: string) => (viewer ? path : `/login?callbackUrl=${encodeURIComponent(path)}`);

  return (
    <div className="accent-mentorship">
      <PageHero accent="accent-mentorship" kicker="Mentorship" title="Build with guidance.">
        <p className="lede">Students and early-career builders work on real research and innovation projects with verified principal investigators and technical mentors, remotely, in person or both. A coordinator reviews every match; nothing is paired automatically.</p>
        <div className="button-row">
          <Link className="button" href={gate("/mentorship/apply")}>Request a match</Link>
          <Link className="button dark" href={gate("/mentorship/mentor")}>Become a mentor</Link>
        </div>
      </PageHero>

      <section className="page-section tight">
        <div className="shell">
          <div className="grid cols-4">
            {[
              ["1. Apply", "Describe your interests, skills and goals. Apply to an opportunity or ask for a match."],
              ["2. Review", "A coordinator reads your application and looks for a suitable mentor and project."],
              ["3. Both accept", "You and the mentor each accept. One acceptance alone doesn't start a placement."],
              ["4. Work together", "Agree a brief, a meeting rhythm and milestones in a private workspace."]
            ].map(([title, body]) => (
              <div key={title} className="card top-accent plain"><div className="card-body"><h3>{title}</h3><p>{body}</p></div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section tight">
        <div className="shell">
          <div className="section-head"><h2>Open opportunities</h2></div>
          <nav className="filters" aria-label="Filter by working mode">
            <Link className={`chip${!mode ? " active" : ""}`} href={href({ mode: undefined })}>Any mode</Link>
            {Object.entries(WORKING_MODES).map(([value, label]) => <Link key={value} className={`chip${mode === value ? " active" : ""}`} href={href({ mode: value })}>{label}</Link>)}
          </nav>
          <nav className="filters" aria-label="Filter by topic">
            <Link className={`chip${!topic ? " active" : ""}`} href={href({ topic: undefined })}>All topics</Link>
            {TOPICS.map((t) => <Link key={t} className={`chip${topic === t ? " active" : ""}`} href={href({ topic: t })}>{t}</Link>)}
          </nav>

          {opportunities.length === 0 ? (
            <div className="empty-state">
              <h3>No open opportunities {topic || mode ? "match these filters" : "yet"}</h3>
              <p>You can still ask a coordinator to look for a match, and we&rsquo;ll be in touch when a suitable mentor is available.</p>
              <p><Link className="button" href={gate("/mentorship/apply")}>Request a match</Link></p>
            </div>
          ) : (
            <div className="grid cols-3">
              {opportunities.map((o) => (
                <article key={o.id} className="card linked top-accent">
                  <div className="card-body">
                    <div className="tags">
                      <span className="tag">{o.topic}</span>
                      <span className="tag neutral">{WORKING_MODES[o.workingMode]}</span>
                    </div>
                    <h3><Link href={`/mentorship/opportunities/${o.id}`}>{o.title}</Link></h3>
                    <p className="clamp-3">{o.scope}</p>
                    <p className="card-meta">
                      <span>{o.mentor.name}{o.mentor.mentorProfile?.status === "VERIFIED" ? ` · Verified ${MENTOR_KINDS[o.mentor.mentorProfile.kind].toLowerCase()}` : ""}</span>
                      <span>{o.duration}</span>
                      <span>{FUNDING_STATUS[o.fundingStatus] ?? o.fundingStatus}</span>
                      <span>{o.capacity - o.filled} of {o.capacity} place{o.capacity === 1 ? "" : "s"} open</span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="muted small mt-3">A match is not a guarantee of admission, employment, funding or a publication. Each opportunity states its actual funding position. A technical mentor is not automatically a university supervisor.</p>
        </div>
      </section>
    </div>
  );
}
