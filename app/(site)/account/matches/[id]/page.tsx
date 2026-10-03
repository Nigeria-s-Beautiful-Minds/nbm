import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field } from "@/components/ActionForm";
import { PlainText } from "@/components/Prose";
import { briefAction, completeMatchAction, matchUpdateAction, milestoneAction, rematchAction, respondMatchAction } from "@/lib/actions/mentorship";
import { FUNDING_STATUS, formatDate } from "@/lib/constants";
import { getApplicationForViewer, getMatchForViewer } from "@/lib/mentorship";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Mentorship match", robots: { index: false } };

type Params = { params: Promise<{ id: string }> };

const STATUS: Record<string, string> = {
  PROPOSED: "Proposed: waiting for both of you to accept", ACTIVE: "Active", DECLINED: "Declined", EXPIRED: "Expired", COMPLETED: "Completed", CLOSED: "Closed", REMATCH_REQUESTED: "Rematch requested"
};

export default async function MatchPage({ params }: Params) {
  const { id } = await params;
  const viewer = await requireViewer(`/account/matches/${id}`);
  // Only the student, the mentor and coordinators can open a match; anyone else gets a 404.
  const found = await getMatchForViewer(id, viewer);
  if (!found) notFound();
  const { match, role } = found;
  const application = await getApplicationForViewer(match.application.id, viewer);
  const myAnswer = role === "student" ? match.studentAcceptedAt : role === "mentor" ? match.mentorAcceptedAt : null;
  const participant = role !== "coordinator";
  const active = match.status === "ACTIVE";

  return (
    <section className="page-section tight accent-mentorship">
      <div className="shell medium">
        <p className="breadcrumb"><Link href="/account/workspace">My workspace</Link> / Match</p>
        <span className="tag">{STATUS[match.status]}</span>
        <h1 className="mt-2">{match.opportunity.title}</h1>
        <p className="muted">Student: {match.student.name} · Mentor: {match.mentor.name}</p>

        <div className="stack lg">
          {match.status === "PROPOSED" && (
            <div className="panel">
              <h2>Proposed match</h2>
              {match.coordinatorNote && <p>Coordinator&rsquo;s note: {match.coordinatorNote}</p>}
              <p>The placement starts only when both of you accept. This offer expires on {formatDate(match.expiresAt)}.</p>
              <ul>
                <li>Student: {match.studentAcceptedAt ? "accepted" : "not answered yet"}</li>
                <li>Mentor: {match.mentorAcceptedAt ? "accepted" : "not answered yet"}</li>
              </ul>
              <p className="small muted">Funding for this opportunity: {FUNDING_STATUS[match.opportunity.fundingStatus] ?? match.opportunity.fundingStatus}{match.opportunity.fundingNote ? `. ${match.opportunity.fundingNote}` : ""}. A match does not guarantee admission, employment, funding or a publication.</p>
              {participant && !myAnswer && (
                <div className="button-row">
                  <ActionForm action={respondMatchAction} submitLabel="Accept" className="inline-form">
                    <input type="hidden" name="matchId" value={match.id} /><input type="hidden" name="answer" value="accept" />
                  </ActionForm>
                  <ActionForm action={respondMatchAction} submitLabel="Decline" className="inline-form" buttonClassName="button danger" confirm="Decline this match?">
                    <input type="hidden" name="matchId" value={match.id} /><input type="hidden" name="answer" value="decline" />
                  </ActionForm>
                </div>
              )}
              {participant && myAnswer && <p className="status success">You accepted. Waiting for the other person.</p>}
            </div>
          )}

          {application && (
            <div className="panel">
              <h2>Application</h2>
              <p className="muted small">Private to the applicant, the matched mentor and coordinators.</p>
              <dl className="facts">
                <dt>Interests</dt><dd>{application.interests}</dd>
                <dt>Experience</dt><dd>{application.experience}</dd>
                <dt>Motivation</dt><dd>{application.motivation}</dd>
                <dt>Goals</dt><dd>{application.goals}</dd>
                <dt>Availability</dt><dd>{application.availability}</dd>
                <dt>Location</dt><dd>{application.location}</dd>
                {application.documentUploadId && (<><dt>Document</dt><dd><a href={`/api/media/${application.documentUploadId}`}>Download CV or portfolio (PDF)</a></dd></>)}
              </dl>
            </div>
          )}

          {(active || match.status === "COMPLETED" || match.status === "REMATCH_REQUESTED") && (
            <>
              <div className="panel">
                <h2>Project brief</h2>
                {active && participant ? (
                  <ActionForm action={briefAction} submitLabel="Save brief">
                    <input type="hidden" name="matchId" value={match.id} />
                    <Field name="brief" label="Agreed brief" type="textarea" rows={4} defaultValue={match.brief ?? ""} />
                    <Field name="supervisor" label="Supervisor and responsibilities" full={false} defaultValue={match.supervisor ?? ""} />
                    <Field name="meetingCadence" label="Meeting rhythm" full={false} defaultValue={match.meetingCadence ?? ""} placeholder="e.g. Fortnightly, 45 minutes" />
                    <Field name="resources" label="Resources and access" type="textarea" rows={2} defaultValue={match.resources ?? ""} />
                    <Field name="expectedOutput" label="Expected output" type="textarea" rows={2} defaultValue={match.expectedOutput ?? ""} />
                  </ActionForm>
                ) : (
                  <dl className="facts">
                    <dt>Brief</dt><dd>{match.brief || "Not written yet"}</dd>
                    <dt>Supervisor</dt><dd>{match.supervisor || "—"}</dd>
                    <dt>Meetings</dt><dd>{match.meetingCadence || "—"}</dd>
                    <dt>Resources</dt><dd>{match.resources || "—"}</dd>
                    <dt>Expected output</dt><dd>{match.expectedOutput || "—"}</dd>
                  </dl>
                )}
              </div>

              <div className="panel">
                <h2>Milestones</h2>
                {match.milestones.length === 0 ? <p className="muted">No milestones yet.</p> : (
                  <div className="record-list">
                    {match.milestones.map((m) => (
                      <div key={m.id} className="row spread">
                        <span>{m.doneAt ? "✓ " : "○ "}{m.title}{m.dueDate ? ` · due ${formatDate(m.dueDate)}` : ""}</span>
                        {active && participant && (
                          <ActionForm action={milestoneAction} submitLabel={m.doneAt ? "Mark not done" : "Mark done"} className="inline-form" buttonClassName="button small ghost">
                            <input type="hidden" name="matchId" value={match.id} /><input type="hidden" name="milestoneId" value={m.id} />
                          </ActionForm>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {active && participant && (
                  <div className="mt-2">
                    <ActionForm action={milestoneAction} submitLabel="Add milestone" buttonClassName="button small secondary">
                      <input type="hidden" name="matchId" value={match.id} />
                      <Field name="title" label="New milestone" required full={false} />
                      <Field name="dueDate" label="Due date" type="date" full={false} />
                    </ActionForm>
                  </div>
                )}
              </div>

              <div className="panel">
                <h2>Progress updates</h2>
                <p className="muted small">Private to the two of you and coordinators. To share work publicly, post a summary in Exhibitions; it goes through the usual review.</p>
                {match.updates.map((u) => (
                  <div key={u.id} className="comment mt-2">
                    <p className="comment-meta"><strong>{u.author.name}</strong><span>{formatDate(u.createdAt)}</span></p>
                    <p className="comment-body">{u.body}</p>
                  </div>
                ))}
                {participant && match.status !== "COMPLETED" && (
                  <div className="mt-2">
                    <ActionForm action={matchUpdateAction} submitLabel="Post update" buttonClassName="button small">
                      <input type="hidden" name="matchId" value={match.id} />
                      <Field name="body" label="New update" type="textarea" rows={3} required />
                    </ActionForm>
                  </div>
                )}
              </div>
            </>
          )}

          {match.status === "COMPLETED" && (
            <div className="panel">
              <h2>Outcome</h2>
              <PlainText text={match.deliverables ?? ""} />
              {match.feedback && (<><h3>Feedback</h3><PlainText text={match.feedback} /></>)}
            </div>
          )}

          {active && role === "mentor" && (
            <div className="panel">
              <h2>Complete the placement</h2>
              <ActionForm action={completeMatchAction} submitLabel="Mark complete" confirm="Mark this placement complete?">
                <input type="hidden" name="matchId" value={match.id} />
                <Field name="deliverables" label="What was delivered" type="textarea" rows={3} required hint="Include negative findings and lessons where relevant." />
                <Field name="feedback" label="Feedback for the student" type="textarea" rows={3} />
              </ActionForm>
            </div>
          )}

          {active && participant && (
            <div className="panel">
              <h2>Something not working?</h2>
              <p className="muted small">Ask the coordinator to step in. Only coordinators see what you write here.</p>
              <ActionForm action={rematchAction} submitLabel="Ask for a rematch" buttonClassName="button small ghost">
                <input type="hidden" name="matchId" value={match.id} />
                <Field name="reason" label="What isn't working?" type="textarea" rows={3} required />
              </ActionForm>
            </div>
          )}
          {match.status === "REMATCH_REQUESTED" && <div className="notice warn"><p>A rematch has been requested. The coordinator is reviewing it and will manage closure or reassignment.</p></div>}
        </div>
      </div>
    </section>
  );
}
