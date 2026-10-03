import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/viewer";

export const metadata = { title: "Action history" };

export default async function AdminAuditPage() {
  await requireCapability("users.manage", "/admin/audit");
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { name: true } } } });
  return (
    <>
      <h1>Action history</h1>
      <p className="muted">Moderation, matching, funding and role changes, with who did them and why. Entries can&rsquo;t be edited.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>When (UTC)</th><th>Who</th><th>Action</th><th>On</th><th>Reason</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5}>Nothing recorded yet.</td></tr>}
            {rows.map((row) => <tr key={row.id}><td>{row.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td><td>{row.actor?.name ?? "System"}</td><td>{row.action}</td><td>{row.targetType.toLowerCase()} {row.targetId}</td><td>{row.reason}</td></tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
