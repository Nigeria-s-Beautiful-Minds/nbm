import Link from "next/link";
import { ActionForm, Field } from "@/components/ActionForm";
import { closeMatchAction, proposeMatchAction, reviewMentorAction, reviewOpportunityAction } from "@/lib/actions/mentorship";
import { MENTOR_KINDS, WORKING_MODES, formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/viewer";

export const metadata = { title: "Mentorship" };

export default async function AdminMentorshipPage() {
  await requireCapability("mentorship.coordinate", "/admin/mentorship");
  const [mentors, opportunities, open, applications, matches] = await Promise.all([
    prisma.mentorProfile.findMany({ where: { status: { in: ["PENDING", "VERIFIED"] } }, orderBy: [{ status: "asc" }, { createdAt: "asc" }], include: { user: { select: { name: true, email: true } } } }),
    prisma.opportunity.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { mentor: { select: { name: true } } } }),
    prisma.opportunity.findMany({ where: { status: "PUBLISHED" }, orderBy: { title: "asc" }, include: { mentor: { select: { name: true } } } }),
    prisma.mentorshipApplication.findMany({ where: { status: { in: ["SUBMITTED", "REVIEWING"] } }, orderBy: { submittedAt: "asc" }, include: { applicant: { select: { name: true, email: true } }, opportunity: { select: { id: true, title: true } } } }),
    prisma.match.findMany({ where: { status: { in: ["PROPOSED", "ACTIVE", "REMATCH_REQUESTED"] } }, orderBy: { updatedAt: "desc" }, include: { opportunity: { select: { title: true } }, student: { select: { name: true } }, mentor: { select: { name: true } } } })
  ]);
  const available = open.filter((o) => o.filled < o.capacity).map((o) => ({ value: o.id, label: `${o.title} · ${o.mentor.name} · ${WORKING_MODES[o.workingMode]} · ${o.location} · ${o.capacity - o.filled} free` }));

  return (
    <>
      <h1>Mentorship</h1>

      <h2 className="mt-3">Mentors</h2>
      {mentors.length === 0 ? <p className="status">No mentor applications.</p> : (
        <div className="record-list">
          {mentors.map((m) => (
            <article key={m.id} className="record">
              <div className="record-head">
                <h3>{m.user.name}</h3><span className={`tag ${m.status === "VERIFIED" ? "ok" : "warn"}`}>{m.status.toLowerCase()}</span>
                <span className="muted small">{m.user.email}</span>
              </div>
              <dl className="facts">
                <dt>Role claimed</dt><dd>{MENTOR_KINDS[m.kind]}</dd>
                <dt>Affiliation</dt><dd>{m.affiliation}</dd>
                <dt>Expertise</dt><dd>{m.expertise.join(", ")}</dd>
                <dt>Interests</dt><dd>{m.projectInterests}</dd>
                <dt>Availability</dt><dd>{m.availability} · {WORKING_MODES[m.workingMode]} · {m.location} · capacity {m.capacity}</dd>
              </dl>
              <div className="record-actions">
                {m.status === "PENDING" && (
                  <ActionForm action={reviewMentorAction} submitLabel="Verify" className="inline-form" buttonClassName="button small" confirm="Confirm you have checked this person's role and affiliation.">
                    <input type="hidden" name="id" value={m.id} /><input type="hidden" name="decision" value="VERIFIED" />
                  </ActionForm>
                )}
                <ActionForm action={reviewMentorAction} submitLabel={m.status === "PENDING" ? "Decline" : "Suspend"} className="inline-form" buttonClassName="button small danger">
                  <input type="hidden" name="id" value={m.id} /><input type="hidden" name="decision" value={m.status === "PENDING" ? "REJECTED" : "SUSPENDED"} />
                  <Field name="reason" label="Reason" required full={false} />
                </ActionForm>
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className="mt-3">Opportunities awaiting review ({opportunities.length})</h2>
      {opportunities.length === 0 ? <p className="status">Nothing waiting.</p> : (
        <div className="record-list">
          {opportunities.map((o) => (
            <article key={o.id} className="record">
              <div className="record-head"><h3><Link href={`/mentorship/opportunities/${o.id}`}>{o.title}</Link></h3><span className="muted small">{o.mentor.name}</span></div>
              <p>{o.scope}</p>
              <div className="record-actions">
                <ActionForm action={reviewOpportunityAction} submitLabel="Publish" className="inline-form" buttonClassName="button small">
                  <input type="hidden" name="id" value={o.id} /><input type="hidden" name="decision" value="PUBLISHED" />
                </ActionForm>
                <ActionForm action={reviewOpportunityAction} submitLabel="Reject" className="inline-form" buttonClassName="button small danger">
                  <input type="hidden" name="id" value={o.id} /><input type="hidden" name="decision" value="REJECTED" />
                  <Field name="reason" label="Reason" required full={false} />
                </ActionForm>
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className="mt-3">Applications to match ({applications.length})</h2>
      <p className="muted small">Read the application, weigh subject, skills, goals, location and capacity, then propose a match. Both people must accept before anything starts.</p>
      {applications.length === 0 ? <p className="status">No applications waiting.</p> : (
        <div className="record-list">
          {applications.map((a) => (
            <article key={a.id} className="record">
              <div className="record-head">
                <h3>{a.applicant.name}</h3>
                <span className="muted small">{a.applicant.email} · {a.location} · submitted {a.submittedAt ? formatDate(a.submittedAt) : ""}</span>
              </div>
              <p className="small">{a.opportunity ? <>Applied for: <Link href={`/mentorship/opportunities/${a.opportunity.id}`}>{a.opportunity.title}</Link></> : "General match request"}</p>
              <dl className="facts">
                <dt>Interests</dt><dd>{a.interests}</dd>
                <dt>Experience</dt><dd>{a.experience}</dd>
                <dt>Motivation</dt><dd>{a.motivation}</dd>
                <dt>Goals</dt><dd>{a.goals}</dd>
                <dt>Availability</dt><dd>{a.availability}</dd>
                {a.documentUploadId && (<><dt>Document</dt><dd><a href={`/api/media/${a.documentUploadId}`}>Download PDF</a></dd></>)}
              </dl>
              <div className="record-actions">
                {available.length === 0 ? <p className="muted small mb-0">No published opportunity has a free place.</p> : (
                  <ActionForm action={proposeMatchAction} submitLabel="Propose match" className="inline-form" buttonClassName="button small">
                    <input type="hidden" name="applicationId" value={a.id} />
                    <Field name="opportunityId" label="Opportunity" type="select" required full={false} options={available} defaultValue={a.opportunity?.id ?? ""} />
                    <Field name="note" label="Note to both (optional)" full={false} />
                  </ActionForm>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className="mt-3">Matches</h2>
      {matches.length === 0 ? <p className="status">No open matches.</p> : (
        <div className="record-list">
          {matches.map((m) => (
            <article key={m.id} className="record">
              <div className="record-head">
                <h3><Link href={`/account/matches/${m.id}`}>{m.opportunity.title}</Link></h3>
                <span className={`tag ${m.status === "REMATCH_REQUESTED" ? "danger" : m.status === "ACTIVE" ? "ok" : "warn"}`}>{m.status.replace(/_/g, " ").toLowerCase()}</span>
                <span className="muted small">{m.student.name} with {m.mentor.name}</span>
              </div>
              {m.status === "PROPOSED" && <p className="small">Student {m.studentAcceptedAt ? "accepted" : "hasn't answered"} · mentor {m.mentorAcceptedAt ? "accepted" : "hasn't answered"} · expires {formatDate(m.expiresAt)}</p>}
              {m.rematchReason && <p><strong>Rematch request:</strong> {m.rematchReason}</p>}
              <div className="record-actions">
                <ActionForm action={closeMatchAction} submitLabel="Close match" className="inline-form" buttonClassName="button small danger" confirm="Close this match and release the place?">
                  <input type="hidden" name="matchId" value={m.id} />
                  <Field name="reason" label="Reason" required full={false} />
                  <Field name="reassign" type="checkbox" label="Return the application to the queue for another match" full={false} />
                </ActionForm>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
