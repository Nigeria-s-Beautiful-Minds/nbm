import type { Metadata } from "next";
import Link from "next/link";
import { RefreshWhilePending } from "@/components/RefreshWhilePending";
import { formatMoney } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Your contribution", robots: { index: false } };

// Where the payment provider sends people back to. Arriving here proves nothing: the status
// shown comes from our own record, which only the provider's verified webhook can change.
export default async function ContributionReturnPage({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const { reference } = await searchParams;
  const contribution = reference ? await prisma.contribution.findUnique({ where: { reference }, include: { campaign: { select: { title: true, slug: true } } } }) : null;
  const status = contribution?.status;
  const pending = status === "INITIATED" || status === "PENDING";

  return (
    <section className="page-section accent-involved">
      <div className="shell narrow">
        <h1>Your contribution</h1>
        {!contribution ? (
          <p className="status error" role="alert">We couldn&rsquo;t find that contribution. If money left your account, please <Link href="/get-involved/contact">contact us</Link> with your payment reference.</p>
        ) : (
          <div className="panel">
            {pending && (<><p className="status" role="status"><strong>Waiting for confirmation.</strong> Your payment provider hasn&rsquo;t confirmed this payment to us yet. This page checks again every few seconds.</p><RefreshWhilePending /></>)}
            {status === "SUCCEEDED" && <p className="status success" role="status"><strong>Thank you.</strong> We have received {formatMoney(contribution.amountMinor, contribution.currency)}. An acknowledgement is on its way to {contribution.donorEmail}.</p>}
            {status === "FAILED" && <p className="status error" role="alert"><strong>The payment didn&rsquo;t go through</strong> and nothing has been counted. You can try again.</p>}
            {status === "REFUNDED" && <p className="status">This contribution was refunded.</p>}
            {status === "DISPUTED" && <p className="status error" role="alert">This payment needs to be checked by our finance team. We&rsquo;ll be in touch at {contribution.donorEmail}.</p>}
            <dl className="facts mt-2">
              <dt>For</dt><dd>{contribution.campaign ? contribution.campaign.title : "NBM general programme"}</dd>
              <dt>Amount</dt><dd>{formatMoney(contribution.amountMinor, contribution.currency)}</dd>
              <dt>Reference</dt><dd>{contribution.reference}</dd>
            </dl>
            <p className="mt-2 mb-0"><Link href={contribution.campaign ? `/sponsorship/${contribution.campaign.slug}` : "/get-involved/contribute"}>{status === "FAILED" ? "Try again" : "Back"}</Link></p>
          </div>
        )}
      </div>
    </section>
  );
}
