import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field } from "@/components/ActionForm";
import { VerifyNotice } from "@/components/VerifyNotice";
import { closeOpportunityAction, createOpportunityAction, mentorApplyAction } from "@/lib/actions/mentorship";
import { FUNDING_STATUS, MENTOR_KINDS, TOPICS, WORKING_MODES } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Mentor with NBM", robots: { index: false } };

const options = (map: Record<string, string>) => Object.entries(map).map(([value, label]) => ({ value, label }));

export default async function MentorPage() {
  const viewer = await requireViewer("/mentorship/mentor");
  const [profile, opportunities] = await Promise.all([
    prisma.mentorProfile.findUnique({ where: { userId: viewer.id } }),
    prisma.opportunity.findMany({ where: { mentorId: viewer.id }, orderBy: { createdAt: "desc" } })
  ]);
  const canPost = profile?.status === "VERIFIED" || can(viewer.roles, "mentorship.coordinate");

  return (
    <section className="page-section accent-mentorship">
      <div className="shell medium">
        <p className="breadcrumb"><Link href="/mentorship">Mentorship</Link> / Mentors</p>
        <h1>Mentor with NBM</h1>
        <p className="lede">Offer a defined, bounded commitment: supervise a research project, guide a build, or co-supervise with a local colleague. You choose how many people you can take on.</p>
        {!viewer.emailVerified ? <VerifyNotice what="apply to mentor" /> : (
          <div className="stack lg">
            <div className="panel">
              <div className="row spread">
                <h2 className="mb-0">Your mentor details</h2>
                {profile && <span className={`tag ${profile.status === "VERIFIED" ? "ok" : profile.status === "PENDING" ? "warn" : "danger"}`}>{profile.status === "VERIFIED" ? "Verified" : profile.status === "PENDING" ? "Awaiting verification" : profile.status === "REJECTED" ? "Not approved" : "Suspended"}</span>}
              </div>
              {profile?.reviewNote && <div className="notice warn mt-2"><p>Coordinator&rsquo;s note: {profile.reviewNote}</p></div>}
              <p className="muted small mt-2">A coordinator verifies your role before you appear as a verified mentor. Changing these details sends them for verification again. We can&rsquo;t promise institutional supervision on your institution&rsquo;s behalf; say only what you can personally commit to.</p>
              <ActionForm action={mentorApplyAction} submitLabel={profile ? "Update details" : "Apply to mentor"}>
                <Field name="kind" label="Your role" type="select" required options={options(MENTOR_KINDS)} defaultValue={profile?.kind} hint="A research PI leads research at an institution. A technical mentor guides practical work and is not automatically a university supervisor." />
                <Field name="affiliation" label="Institution or organisation" required full={false} defaultValue={profile?.affiliation} />
                <Field name="location" label="Where are you based?" required full={false} defaultValue={profile?.location} />
                <Field name="expertise" label="Areas of expertise" required defaultValue={profile?.expertise.join(", ")} hint="Separate with commas." />
                <Field name="projectInterests" label="Projects you would like to support" type="textarea" rows={3} required defaultValue={profile?.projectInterests} />
                <Field name="availability" label="Availability" required full={false} defaultValue={profile?.availability} placeholder="e.g. 2 hours a week" />
                <Field name="workingMode" label="How you would work" type="select" required full={false} options={options(WORKING_MODES)} defaultValue={profile?.workingMode} />
                <Field name="capacity" label="How many people can you mentor at once?" type="number" required min={1} full={false} defaultValue={String(profile?.capacity ?? 1)} />
              </ActionForm>
            </div>

            {canPost && (
              <div className="panel">
                <h2>Post an opportunity</h2>
                <p className="muted small">Opportunities are checked by a coordinator before they are published. State the funding position as it really is.</p>
                <ActionForm action={createOpportunityAction} submitLabel="Save opportunity">
                  <Field name="title" label="Title" required maxLength={140} />
                  <Field name="topic" label="Topic" type="select" required options={TOPICS} full={false} />
                  <Field name="workingMode" label="Working mode" type="select" required options={options(WORKING_MODES)} full={false} />
                  <Field name="scope" label="Project scope" type="textarea" rows={4} required />
                  <Field name="learningGoals" label="Learning goals" type="textarea" rows={3} required />
                  <Field name="skills" label="Skills" required hint="Separate with commas." />
                  <Field name="duration" label="Expected duration" required full={false} placeholder="e.g. 12 weeks" />
                  <Field name="hoursPerWeek" label="Hours per week" required full={false} placeholder="e.g. 6-8 hours" />
                  <Field name="location" label="Location" required full={false} />
                  <Field name="capacity" label="Places" type="number" required min={1} full={false} defaultValue="1" />
                  <Field name="facilities" label="Facilities and resources available" type="textarea" rows={2} />
                  <Field name="fundingStatus" label="Funding" type="select" required options={options(FUNDING_STATUS)} full={false} />
                  <Field name="fundingNote" label="Funding details" full={false} hint="Who pays for what, if anything." />
                </ActionForm>
              </div>
            )}

            {opportunities.length > 0 && (
              <div className="panel">
                <h2>Your opportunities</h2>
                <div className="record-list">
                  {opportunities.map((o) => (
                    <div key={o.id} className="record">
                      <div className="record-head">
                        <h3><Link href={`/mentorship/opportunities/${o.id}`}>{o.title}</Link></h3>
                        <span className={`tag ${o.status === "PUBLISHED" ? "ok" : o.status === "PENDING" ? "warn" : "neutral"}`}>{o.status === "PENDING" ? "Awaiting review" : o.status.toLowerCase()}</span>
                        <span className="muted small">{o.filled} of {o.capacity} places filled</span>
                      </div>
                      {o.reviewNote && <p className="small">Coordinator&rsquo;s note: {o.reviewNote}</p>}
                      {(o.status === "PUBLISHED" || o.status === "PENDING") && (
                        <ActionForm action={closeOpportunityAction} submitLabel="Close to applications" className="inline-form" buttonClassName="button small ghost" confirm="Close this opportunity?">
                          <input type="hidden" name="id" value={o.id} />
                        </ActionForm>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
