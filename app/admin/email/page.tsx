import { ActionForm } from "@/components/ActionForm";
import { retryEmailAction } from "@/lib/actions/admin";
import { isProductionStage } from "@/lib/config";
import { emailConfigured } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/viewer";

export const metadata = { title: "Email delivery" };

export default async function AdminEmailPage() {
  await requireCapability("operations.manage", "/admin/email");
  const rows = await prisma.emailOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <h1>Email delivery</h1>
      {!emailConfigured() && <div className="notice warn"><p><strong>Email delivery is not configured.</strong> Messages are being saved in the queue but not sent. Set RESEND_API_KEY or the SMTP settings on the server. No credentials are shown on this page.</p></div>}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Created</th><th>To</th><th>Subject</th><th>Type</th><th>Status</th><th>Attempts</th><th>Last error</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8}>No email has been queued yet.</td></tr>}
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td><td>{row.toEmail}</td>
                <td>
                  {row.subject}
                  {/* Staging only: lets testers follow confirmation links without a mail provider. */}
                  {!isProductionStage && <details><summary>Show message (staging only)</summary><div dangerouslySetInnerHTML={{ __html: row.html }} /></details>}
                </td>
                <td>{row.kind}</td><td>{row.status.toLowerCase()}</td><td>{row.attempts}</td><td>{row.lastError}</td>
                <td>{row.status !== "SENT" && <ActionForm action={retryEmailAction} submitLabel="Send now" className="inline-form" buttonClassName="button small secondary"><input type="hidden" name="id" value={row.id} /></ActionForm>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
