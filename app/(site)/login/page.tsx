import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

/** Only same-site paths are allowed as a return address, never another origin. */
function safeReturnPath(value: string | undefined): string {
  if (!value) return "/account/workspace";
  try {
    const path = value.startsWith("http") ? new URL(value).pathname + new URL(value).search : value;
    return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/account/workspace";
  } catch {
    return "/account/workspace";
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; registered?: string; reset?: string }> }) {
  const params = await searchParams;
  const callbackUrl = safeReturnPath(params.callbackUrl);
  if (await getViewer()) redirect(callbackUrl);

  return (
    <section className="page-section">
      <div className="shell auth-wrap">
        <h1>Sign in</h1>
        {params.registered === "1" && <p className="status success" role="status">Account created. We&rsquo;ve emailed you a confirmation link. Sign in to continue.</p>}
        {params.reset === "1" && <p className="status success" role="status">Password updated. Sign in with your new password.</p>}
        <div className="panel mt-2">
          <LoginForm callbackUrl={callbackUrl} />
        </div>
        <p className="mt-2"><Link href="/forgot-password">Forgot your password?</Link></p>
        <p>New to NBM? <Link href="/join">Join the community</Link>.</p>
      </div>
    </section>
  );
}
