import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlainText } from "@/components/Prose";
import { FUNDING_STATUS, MENTOR_KINDS, WORKING_MODES } from "@/lib/constants";
import { getOpportunity } from "@/lib/mentorship";
import { getViewer } from "@/lib/viewer";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const o = await getOpportunity(id, null);
  return o ? { title: o.title, description: o.scope.slice(0, 160) } : { title: "Mentorship", robots: { index: false } };
}

export default async function OpportunityPage({ params }: Params) {
  const { id } = await params;
  const viewer = await getViewer();
  const o = await getOpportunity(id, viewer);
  if (!o) notFound();
  const open = o.status === "PUBLISHED" && o.filled < o.capacity;
  const applyPath = `/mentorship/apply?opportunity=${o.id}`;
  const profile = o.mentor.mentorProfile;

  return (
    <section className="page-section tight accent-mentorship">
      <div className="shell">
        <p className="breadcrumb"><Link href="/mentorship">Mentorship</Link> / Opportunity</p>
        {o.status !== "PUBLISHED" && <div className="notice warn"><p>{o.status === "CLOSED" ? "This opportunity is closed and no longer takes applications." : `This opportunity is ${o.status.toLowerCase()} and not public.`}{o.reviewNote ? ` Note: ${o.reviewNote}` : ""}</p></div>}
        <div className="sidebar-layout">
          <article>
            <div className="tags"><span className="tag">{o.topic}</span><span className="tag neutral">{WORKING_MODES[o.workingMode]}</span></div>
            <h1 className="mt-2">{o.title}</h1>
            <h2>Project scope</h2>
            <PlainText text={o.scope} />
            <h2>What you will learn</h2>
            <PlainText text={o.learningGoals} />
            <h2>Skills</h2>
            <div className="tags">{o.skills.map((skill) => <span key={skill} className="tag neutral">{skill}</span>)}</div>
            {o.facilities && (<><h2 className="mt-3">Facilities and resources</h2><PlainText text={o.facilities} /></>)}
          </article>
          <aside className="stack">
            <div className="panel">
              <h2>At a glance</h2>
              <dl className="facts">
                <dt>Mentor</dt><dd>{o.mentor.name}</dd>
                {profile?.status === "VERIFIED" && (<><dt>Role</dt><dd>Verified {MENTOR_KINDS[profile.kind].toLowerCase()}, {profile.affiliation}</dd></>)}
                <dt>Duration</dt><dd>{o.duration}</dd>
                <dt>Time</dt><dd>{o.hoursPerWeek} per week</dd>
                <dt>Location</dt><dd>{o.location} ({WORKING_MODES[o.workingMode]})</dd>
                <dt>Funding</dt><dd>{FUNDING_STATUS[o.fundingStatus] ?? o.fundingStatus}{o.fundingNote ? `. ${o.fundingNote}` : ""}</dd>
                <dt>Places</dt><dd>{Math.max(0, o.capacity - o.filled)} of {o.capacity} open</dd>
              </dl>
              {open && o.mentor.id !== viewer?.id && (
                <p className="mt-2 mb-0"><Link className="button" href={viewer ? applyPath : `/login?callbackUrl=${encodeURIComponent(applyPath)}`}>Apply for this opportunity</Link></p>
              )}
            </div>
            <div className="panel">
              <h2>Before you apply</h2>
              <ul className="small mb-0">
                <li>Your application is private: coordinators see it, and the mentor sees it only if a coordinator proposes a match.</li>
                <li>A placement starts only when you and the mentor both accept.</li>
                <li>A match doesn&rsquo;t guarantee admission, a job, funding or a publication.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
