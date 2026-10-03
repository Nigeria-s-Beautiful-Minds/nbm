import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { consumeAuthToken } from "@/lib/tokens";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const userId = token ? await consumeAuthToken(token, "VERIFY_EMAIL") : null;
  if (userId) await prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });

  return (
    <section className="page-section">
      <div className="shell auth-wrap">
        {userId ? (
          <>
            <h1>Email confirmed</h1>
            <p className="status success" role="status">Thank you. You can now post, comment, host conversations and apply for mentorship.</p>
            <p className="mt-2"><Link className="button" href="/account/workspace">Go to my workspace</Link></p>
          </>
        ) : (
          <>
            <h1>This link didn&rsquo;t work</h1>
            <p className="status error" role="alert">The confirmation link is invalid, already used or has expired.</p>
            <p className="mt-2">Sign in and request a new link from your <Link href="/account/settings">account settings</Link>.</p>
          </>
        )}
      </div>
    </section>
  );
}
