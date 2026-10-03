import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field } from "@/components/ActionForm";
import { changePasswordAction, updateSettingsAction } from "@/lib/actions/account";
import { resendVerificationAction } from "@/lib/actions/auth";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Account settings" };

export default async function SettingsPage() {
  const viewer = await requireViewer("/account/settings");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: viewer.id }, select: { email: true, emailOnReplies: true, emailOnUpdates: true } });
  return (
    <div className="stack lg">
      <h1 className="mb-0">Account settings</h1>
      <div className="panel">
        <h2>Email address</h2>
        <p>{user.email} {viewer.emailVerified ? <span className="tag ok">Confirmed</span> : <span className="tag warn">Not confirmed</span>}</p>
        {!viewer.emailVerified && <ActionForm action={resendVerificationAction} submitLabel="Send a new confirmation link" className="stack" buttonClassName="button small" />}
      </div>
      <div className="panel">
        <h2>Email notifications</h2>
        <p className="muted small">Notices about moderation, mentorship matches and payments are always sent. These are optional. The mailing list is separate: <Link href="/get-involved/mailing-list">subscribe here</Link>.</p>
        <ActionForm action={updateSettingsAction} submitLabel="Save settings" pendingLabel="Saving…">
          <Field name="emailOnReplies" type="checkbox" label="Email me when someone replies to me or comments on my work" defaultValue={user.emailOnReplies ? "on" : ""} />
          <Field name="emailOnUpdates" type="checkbox" label="Email me about progress updates in my placements" defaultValue={user.emailOnUpdates ? "on" : ""} />
        </ActionForm>
      </div>
      <div className="panel">
        <h2>Change password</h2>
        <ActionForm action={changePasswordAction} submitLabel="Change password" pendingLabel="Saving…">
          <Field name="currentPassword" label="Current password" type="password" required autoComplete="current-password" />
          <Field name="password" label="New password" type="password" required minLength={10} autoComplete="new-password" full={false} />
          <Field name="confirmPassword" label="Confirm new password" type="password" required minLength={10} autoComplete="new-password" full={false} />
        </ActionForm>
      </div>
      <div className="panel">
        <h2>Your data</h2>
        <p className="mb-0">To request a copy of your data or to delete your account, <Link href="/get-involved/contact">contact us</Link>. Some financial records must be kept even after an account is deleted; the <Link href="/about/privacy">privacy policy</Link> explains which.</p>
      </div>
    </div>
  );
}
