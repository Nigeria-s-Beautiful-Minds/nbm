import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field } from "@/components/ActionForm";
import { resetPasswordAction } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <section className="page-section">
      <div className="shell auth-wrap">
        <h1>Choose a new password</h1>
        {!token ? (
          <p className="status error" role="alert">This reset link is missing its code. Please <Link href="/forgot-password">request a new one</Link>.</p>
        ) : (
          <div className="panel">
            <ActionForm action={resetPasswordAction} submitLabel="Update password" pendingLabel="Updating…">
              <input type="hidden" name="token" value={token} />
              <Field name="password" label="New password" type="password" required minLength={10} autoComplete="new-password" hint="At least 10 characters." />
              <Field name="confirmPassword" label="Confirm new password" type="password" required minLength={10} autoComplete="new-password" />
            </ActionForm>
          </div>
        )}
      </div>
    </section>
  );
}
