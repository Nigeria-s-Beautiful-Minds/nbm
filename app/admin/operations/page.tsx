import { ActionForm, Field } from "@/components/ActionForm";
import { contactStatusAction, volunteerStatusAction } from "@/lib/actions/admin";
import { formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/viewer";

export const metadata = { title: "Volunteers and contact" };

const opts = (values: string[]) => values.map((value) => ({ value, label: value.replace(/_/g, " ").toLowerCase() }));

export default async function AdminOperationsPage() {
  await requireCapability("operations.manage", "/admin/operations");
  const [volunteers, contacts, subscribers] = await Promise.all([
    prisma.volunteerApplication.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.contactRequest.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.mailingSubscriber.groupBy({ by: ["status"], _count: true })
  ]);
  const count = (status: string) => subscribers.find((s) => s.status === status)?._count ?? 0;

  return (
    <>
      <h1>Volunteers and contact</h1>
      <p className="muted">Private records. Exports are for authorised staff only: handle them as personal data and don&rsquo;t share them outside NBM.</p>
      <p className="button-row">
        <a className="button small secondary" href="/admin/operations/export?type=volunteers">Export volunteers (CSV)</a>
        <a className="button small secondary" href="/admin/operations/export?type=contacts">Export contact requests (CSV)</a>
        <a className="button small secondary" href="/admin/operations/export?type=subscribers">Export confirmed subscribers (CSV)</a>
      </p>

      <h2 className="mt-3">Mailing list</h2>
      <p>{count("ACTIVE")} confirmed · {count("PENDING")} awaiting confirmation · {count("UNSUBSCRIBED")} unsubscribed</p>

      <h2 className="mt-3">Volunteer applications</h2>
      {volunteers.length === 0 ? <p className="status">No applications yet.</p> : (
        <div className="record-list">
          {volunteers.map((v) => (
            <article key={v.id} className="record">
              <div className="record-head"><h3>{v.name}</h3><span className="tag neutral">{v.committee}</span><span className="muted small">{v.email} · {formatDate(v.createdAt)}</span></div>
              <dl className="facts"><dt>Interests</dt><dd>{v.interests}</dd><dt>Skills</dt><dd>{v.skills}</dd><dt>Availability</dt><dd>{v.availability}</dd></dl>
              <div className="record-actions">
                <ActionForm action={volunteerStatusAction} submitLabel="Save" className="inline-form" buttonClassName="button small">
                  <input type="hidden" name="id" value={v.id} />
                  <Field name="status" label="Status" type="select" required full={false} defaultValue={v.status} options={opts(["SUBMITTED", "REVIEWING", "ACCEPTED", "DECLINED", "WITHDRAWN"])} />
                  <Field name="notes" label="Notes" full={false} defaultValue={v.notes ?? ""} />
                </ActionForm>
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className="mt-3">Contact requests</h2>
      {contacts.length === 0 ? <p className="status">No messages yet.</p> : (
        <div className="record-list">
          {contacts.map((c) => (
            <article key={c.id} className="record">
              <div className="record-head"><h3>{c.subject}</h3><span className="muted small">{c.name} · <a href={`mailto:${c.email}`}>{c.email}</a> · {formatDate(c.createdAt)}</span></div>
              <p style={{ whiteSpace: "pre-wrap" }}>{c.message}</p>
              <div className="record-actions">
                <ActionForm action={contactStatusAction} submitLabel="Save" className="inline-form" buttonClassName="button small">
                  <input type="hidden" name="id" value={c.id} />
                  <Field name="status" label="Status" type="select" required full={false} defaultValue={c.status} options={opts(["NEW", "IN_PROGRESS", "RESOLVED", "ARCHIVED"])} />
                  <Field name="notes" label="Notes" full={false} defaultValue={c.notes ?? ""} />
                </ActionForm>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
