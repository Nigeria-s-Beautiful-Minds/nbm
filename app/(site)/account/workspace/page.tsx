import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { withdrawApplicationAction } from "@/lib/actions/mentorship";
import { formatDate, formatMoney } from "@/lib/constants";
import { EXHIBITION_STATUS_LABELS, listExhibitionsByAuthor } from "@/lib/exhibitions";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "My workspace" };

const APPLICATION: Record<string, string> = { DRAFT: "Draft", SUBMITTED: "Submitted", REVIEWING: "Being reviewed", MATCH_PROPOSED: "Match proposed", ACTIVE: "Active placement", DECLINED: "Declined", WITHDRAWN: "Withdrawn", COMPLETED: "Completed", CLOSED: "Closed" };
const MATCH: Record<string, string> = { PROPOSED: "Needs an answer", ACTIVE: "Active", DECLINED: "Declined", EXPIRED: "Expired", COMPLETED: "Completed", CLOSED: "Closed", REMATCH_REQUESTED: "Rematch requested" };

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ applied?: string; requested?: string }> }) {
  const params = await searchParams;
  const viewer = await requireViewer("/account/workspace");
  // Everything here is filtered by the viewer's own id: nobody else's records can appear.
  const [exhibitions, threads, rooms, applications, matches, campaigns, contributions] = await Promise.all([
    listExhibitionsByAuthor(viewer.id),
    prisma.thread.findMany({ where: { hostId: viewer.id, audioRooms: { none: {} } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, title: true, status: true } }),
    prisma.audioRoom.findMany({ where: { hostId: viewer.id }, orderBy: { startsAt: "desc" }, take: 20, select: { id: true, title: true, status: true, startsAt: true } }),
    prisma.mentorshipApplication.findMany({ where: { applicantId: viewer.id }, orderBy: { updatedAt: "desc" }, include: { opportunity: { select: { title: true } } } }),
    prisma.match.findMany({ where: { OR: [{ studentId: viewer.id }, { mentorId: viewer.id }] }, orderBy: { updatedAt: "desc" }, include: { opportunity: { select: { title: true } } } }),
    prisma.campaign.findMany({ where: { requesterId: viewer.id }, orderBy: { createdAt: "desc" } }),
    prisma.contribution.findMany({ where: { userId: viewer.id, status: { in: ["SUCCEEDED", "REFUNDED"] } }, orderBy: { createdAt: "desc" }, take: 20, include: { campaign: { select: { title: true } } } })
  ]);

  return (
    <div className="stack lg">
      <div>
        <h1>My workspace</h1>
        <p className="muted">Private to you. Your posts, conversations, mentorship applications and support requests.</p>
        {params.applied === "1" && <p className="status success" role="status">Application submitted. A coordinator will review it. This is a receipt, not an acceptance.</p>}
        {params.requested === "1" && <p className="status success" role="status">Support request submitted. Our team will review it before anything is published.</p>}
      </div>

      <div className="panel">
        <div className="row spread"><h2 className="mb-0">My exhibitions</h2><Link className="button small" href="/exhibitions/new">New post</Link></div>
        {exhibitions.length === 0 ? <p className="muted mt-2 mb-0">You haven&rsquo;t shared a project yet.</p> : (
          <div className="record-list mt-2">
            {exhibitions.map((post) => (
              <div key={post.id} className="record">
                <div className="record-head">
                  <h3><Link href={`/exhibitions/${post.slug}`}>{post.title}</Link></h3>
                  <span className={`tag ${post.status === "APPROVED" ? "ok" : post.status === "PENDING" ? "warn" : post.status === "REJECTED" || post.status === "REMOVED" ? "danger" : "neutral"}`}>{EXHIBITION_STATUS_LABELS[post.status]}</span>
                  {post.revisionStatus === "PENDING" && <span className="tag warn">Edit awaiting review</span>}
                  {post.status !== "REMOVED" && <Link href={`/exhibitions/${post.slug}/edit`}>Edit</Link>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="row spread"><h2 className="mb-0">Conversations I host</h2><Link className="button small secondary" href="/discussion/new">New conversation</Link></div>
        {threads.length + rooms.length === 0 ? <p className="muted mt-2 mb-0">None yet.</p> : (
          <ul className="mt-2 mb-0">
            {rooms.map((r) => <li key={r.id}><Link href={`/discussion/rooms/${r.id}`}>{r.title}</Link> <span className="muted small">· audio room · {r.status.toLowerCase()} · {formatDate(r.startsAt)}</span></li>)}
            {threads.map((t) => <li key={t.id}><Link href={`/discussion/${t.id}`}>{t.title}</Link> <span className="muted small">· {t.status.toLowerCase()}</span></li>)}
          </ul>
        )}
      </div>

      <div className="panel">
        <div className="row spread"><h2 className="mb-0">Mentorship</h2><Link className="button small secondary" href="/mentorship/mentor">Mentor details</Link></div>
        {matches.length > 0 && (
          <>
            <h3 className="mt-2">Matches</h3>
            <ul>
              {matches.map((m) => <li key={m.id}><Link href={`/account/matches/${m.id}`}>{m.opportunity.title}</Link> <span className={`tag ${m.status === "PROPOSED" ? "warn" : m.status === "ACTIVE" ? "ok" : "neutral"}`}>{MATCH[m.status]}</span> <span className="muted small">{m.mentorId === viewer.id ? "as mentor" : "as student"}</span></li>)}
            </ul>
          </>
        )}
        <h3 className="mt-2">My applications</h3>
        {applications.length === 0 ? <p className="muted mb-0">No applications. <Link href="/mentorship">Browse opportunities</Link>.</p> : (
          <div className="record-list">
            {applications.map((a) => (
              <div key={a.id} className="record">
                <div className="record-head">
                  <h3>{a.opportunity?.title ?? "General match request"}</h3>
                  <span className="tag neutral">{APPLICATION[a.status]}</span>
                  {a.submittedAt && <span className="muted small">Submitted {formatDate(a.submittedAt)}</span>}
                  {a.status === "DRAFT" && <Link href={`/mentorship/apply?application=${a.id}`}>Continue</Link>}
                </div>
                {["DRAFT", "SUBMITTED", "REVIEWING", "MATCH_PROPOSED"].includes(a.status) && (
                  <ActionForm action={withdrawApplicationAction} submitLabel="Withdraw" className="inline-form" buttonClassName="button small ghost" confirm="Withdraw this application?">
                    <input type="hidden" name="id" value={a.id} />
                  </ActionForm>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="row spread"><h2 className="mb-0">Support requests</h2><Link className="button small secondary" href="/sponsorship/request">Request support</Link></div>
        {campaigns.length === 0 ? <p className="muted mt-2 mb-0">None yet.</p> : (
          <ul className="mt-2 mb-0">
            {campaigns.map((c) => <li key={c.id}><Link href={`/sponsorship/${c.slug}`}>{c.title}</Link> <span className="tag neutral">{c.status.toLowerCase()}</span>{c.reviewNote && c.status === "REJECTED" ? <span className="small"> Note: {c.reviewNote}</span> : null}</li>)}
          </ul>
        )}
        {contributions.length > 0 && (
          <>
            <h3 className="mt-2">My contributions</h3>
            <ul className="mb-0">
              {contributions.map((c) => <li key={c.id}>{formatMoney(c.amountMinor - c.refundedMinor, c.currency)} to {c.campaign?.title ?? "the general programme"} <span className="muted small">· {formatDate(c.createdAt)} · ref {c.reference}{c.status === "REFUNDED" ? " · refunded" : ""}</span></li>)}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
