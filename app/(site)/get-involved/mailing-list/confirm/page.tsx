import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";

export const metadata: Metadata = { title: "Subscription confirmed", robots: { index: false } };

export default async function ConfirmSubscriptionPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  // The subscription becomes active only here, and the consent time is recorded with it.
  const result = token
    ? await prisma.mailingSubscriber.updateMany({ where: { confirmTokenHash: hashToken(token), status: "PENDING" }, data: { status: "ACTIVE", consentAt: new Date(), confirmTokenHash: null } })
    : { count: 0 };
  return (
    <section className="page-section accent-involved">
      <div className="shell auth-wrap">
        {result.count > 0 ? (
          <><h1>You&rsquo;re subscribed</h1><p className="status success" role="status">Thank you. You&rsquo;ll now receive occasional updates from NBM.</p></>
        ) : (
          <><h1>This link didn&rsquo;t work</h1><p className="status error" role="alert">The confirmation link is invalid or has already been used.</p><p className="mt-2"><Link href="/get-involved/mailing-list">Subscribe again</Link></p></>
        )}
      </div>
    </section>
  );
}
