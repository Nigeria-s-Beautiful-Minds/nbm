import Link from "next/link";
import { ActionForm, Field } from "@/components/ActionForm";
import { endRoomAction, moderateThreadAction, resolveReportAction } from "@/lib/actions/admin";
import { formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/viewer";

export const metadata = { title: "Reports and discussion" };

export default async function AdminModerationPage() {
  await requireCapability("moderation", "/admin/moderation");
  const [reports, handled, rooms, threads] = await Promise.all([
    prisma.report.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, include: { reporter: { select: { name: true } } } }),
    prisma.report.findMany({ where: { status: { not: "OPEN" } }, orderBy: { handledAt: "desc" }, take: 20 }),
    prisma.audioRoom.findMany({ orderBy: { startsAt: "desc" }, take: 20, include: { host: { select: { name: true } }, members: { select: { secondsInRoom: true } } } }),
    prisma.thread.findMany({ where: { status: { not: "OPEN" } }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, title: true, status: true } })
  ]);

  return (
    <>
      <h1>Reports and discussion</h1>
      <p className="muted">Open the reported item, take any action there (remove a comment or message, lock or archive a conversation, remove an exhibition from its review page), then close the report with a note.</p>

      <h2 className="mt-3">Open reports ({reports.length})</h2>
      {reports.length === 0 ? <p className="status">No open reports.</p> : (
        <div className="record-list">
          {reports.map((report) => (
            <article key={report.id} className="record">
              <div className="record-head">
                <h3>{report.reason}</h3>
                <span className="tag neutral">{report.targetType.replace(/_/g, " ").toLowerCase()}</span>
                <span className="muted small">Reported by {report.reporter.name} · {formatDate(report.createdAt)}</span>
              </div>
              {report.details && <p>{report.details}</p>}
              {report.targetHref && <p><Link href={report.targetHref}>Open the reported item</Link></p>}
              <div className="record-actions">
                <ActionForm action={resolveReportAction} submitLabel="Close report" className="inline-form" buttonClassName="button small">
                  <input type="hidden" name="id" value={report.id} />
                  <Field name="status" label="Outcome" type="select" required full={false} options={[{ value: "ACTIONED", label: "Action taken" }, { value: "DISMISSED", label: "No action needed" }]} />
                  <Field name="note" label="What you did and why" required full={false} />
                </ActionForm>
                {report.targetType === "THREAD" && (
                  <ActionForm action={moderateThreadAction} submitLabel="Archive conversation" className="inline-form" buttonClassName="button small danger">
                    <input type="hidden" name="id" value={report.targetId} /><input type="hidden" name="status" value="ARCHIVED" />
                    <Field name="reason" label="Reason" required full={false} />
                  </ActionForm>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className="mt-3">Audio rooms</h2>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Room</th><th>Host</th><th>Status</th><th>Start</th><th>Participant-minutes</th><th></th></tr></thead>
          <tbody>
            {rooms.length === 0 && <tr><td colSpan={6}>No rooms yet.</td></tr>}
            {rooms.map((room) => (
              <tr key={room.id}>
                <td><Link href={`/discussion/rooms/${room.id}`}>{room.title}</Link></td>
                <td>{room.host.name}</td>
                <td>{room.status.toLowerCase()}{room.endReason ? ` (${room.endReason})` : ""}</td>
                <td>{formatDate(room.startsAt)}</td>
                <td>{Math.round(room.members.reduce((sum, m) => sum + m.secondsInRoom, 0) / 60)}</td>
                <td>{room.status === "LIVE" && (
                  <ActionForm action={endRoomAction} submitLabel="End room" className="inline-form" buttonClassName="button small danger" confirm="End this room for everyone?">
                    <input type="hidden" name="id" value={room.id} />
                  </ActionForm>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-3">Locked and archived conversations</h2>
      {threads.length === 0 ? <p className="status">None.</p> : (
        <div className="record-list">
          {threads.map((thread) => (
            <div key={thread.id} className="record">
              <div className="record-head"><h3><Link href={`/discussion/${thread.id}`}>{thread.title}</Link></h3><span className="tag neutral">{thread.status.toLowerCase()}</span></div>
              <ActionForm action={moderateThreadAction} submitLabel="Reopen" className="inline-form" buttonClassName="button small secondary">
                <input type="hidden" name="id" value={thread.id} /><input type="hidden" name="status" value="OPEN" />
                <Field name="reason" label="Reason" required full={false} />
              </ActionForm>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-3">Recently closed reports</h2>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Reason</th><th>Outcome</th><th>Note</th><th>Closed</th></tr></thead>
          <tbody>
            {handled.length === 0 && <tr><td colSpan={4}>None yet.</td></tr>}
            {handled.map((r) => <tr key={r.id}><td>{r.reason}</td><td>{r.status.toLowerCase()}</td><td>{r.resolutionNote}</td><td>{r.handledAt ? formatDate(r.handledAt) : ""}</td></tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
