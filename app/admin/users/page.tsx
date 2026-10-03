import { ActionForm, Field } from "@/components/ActionForm";
import { setRolesAction, suspendUserAction } from "@/lib/actions/admin";
import { formatDate } from "@/lib/constants";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/viewer";

export const metadata = { title: "Members and roles" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireCapability("users.manage", "/admin/users");
  const q = (await searchParams).q?.trim().slice(0, 80);
  const users = await prisma.user.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : undefined,
    orderBy: [{ createdAt: "desc" }], take: 60,
    select: { id: true, name: true, email: true, roles: true, emailVerified: true, suspendedAt: true, createdAt: true }
  });
  return (
    <>
      <h1>Members and roles</h1>
      <p className="muted">Only administrators can give or remove staff roles. Changes apply on the person&rsquo;s next request and are recorded with your reason.</p>
      <form className="search-form" action="/admin/users" role="search">
        <label className="sr-only" htmlFor="user-q">Search members</label>
        <input id="user-q" className="field" type="search" name="q" defaultValue={q} placeholder="Search by name or email" />
        <button className="button secondary" type="submit">Search</button>
      </form>
      <div className="record-list">
        {users.map((user) => (
          <article key={user.id} className="record">
            <div className="record-head">
              <h3>{user.name}</h3>
              {user.suspendedAt && <span className="tag danger">Suspended</span>}
              {!user.emailVerified && <span className="tag warn">Email not confirmed</span>}
              <span className="muted small">{user.email} · joined {formatDate(user.createdAt)}</span>
            </div>
            <details>
              <summary>Roles: {user.roles.filter((r) => r !== "MEMBER").map((r) => ROLE_LABELS[r]).join(", ") || "member only"}</summary>
              <div className="record-actions">
                <ActionForm action={setRolesAction} submitLabel="Save roles" className="stack" buttonClassName="button small">
                  <input type="hidden" name="userId" value={user.id} />
                  <div className="row">
                    {STAFF_ROLES.map((role) => <Field key={role} name={`role_${role}`} type="checkbox" label={ROLE_LABELS[role]} full={false} defaultValue={user.roles.includes(role) ? "on" : ""} />)}
                  </div>
                  <Field name="reason" label="Reason for the change" required />
                </ActionForm>
                <ActionForm action={suspendUserAction} submitLabel={user.suspendedAt ? "Reinstate account" : "Suspend account"} className="stack" buttonClassName="button small danger" confirm={user.suspendedAt ? "Reinstate this account?" : "Suspend this account? They will be signed out and unable to sign in."}>
                  <input type="hidden" name="userId" value={user.id} /><input type="hidden" name="suspend" value={user.suspendedAt ? "false" : "true"} />
                  <Field name="reason" label="Reason" required />
                </ActionForm>
              </div>
            </details>
          </article>
        ))}
      </div>
    </>
  );
}
