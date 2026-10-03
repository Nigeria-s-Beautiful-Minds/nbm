import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field } from "@/components/ActionForm";
import { forgotPasswordAction } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <section className="page-section">
      <div className="shell auth-wrap">
        <h1>Reset your password</h1>
        <p>Enter your account email and we&rsquo;ll send a link to choose a new password.</p>
        <div className="panel">
          <ActionForm action={forgotPasswordAction} submitLabel="Send reset link" hideOnSuccess>
            <Field name="email" label="Email" type="email" required autoComplete="email" />
          </ActionForm>
        </div>
        <p className="mt-2"><Link href="/login">Back to sign in</Link></p>
      </div>
    </section>
  );
}
