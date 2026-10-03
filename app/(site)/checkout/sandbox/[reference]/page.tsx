import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sandboxPayAction } from "@/lib/actions/sandbox";
import { formatMoney } from "@/lib/constants";
import { configuredProvider } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Test checkout", robots: { index: false } };

type Params = { params: Promise<{ reference: string }> };

export default async function SandboxCheckoutPage({ params }: Params) {
  if (configuredProvider() !== "devsandbox") notFound();
  const { reference } = await params;
  const contribution = await prisma.contribution.findUnique({ where: { reference } });
  if (!contribution || contribution.provider !== "devsandbox") notFound();

  return (
    <section className="page-section">
      <div className="shell auth-wrap">
        <div className="notice warn"><p><strong>Development sandbox.</strong> This page stands in for a payment provider&rsquo;s hosted checkout. No real money moves.</p></div>
        <h1>Test checkout</h1>
        <p>{formatMoney(contribution.amountMinor, contribution.currency)} · reference {contribution.reference}</p>
        <form action={sandboxPayAction} className="stack">
          <input type="hidden" name="reference" value={reference} />
          <button className="button" name="kind" value="success" type="submit">Simulate successful payment</button>
          <button className="button danger" name="kind" value="failed" type="submit">Simulate failed payment</button>
          <button className="button ghost" name="kind" value="cancel" type="submit">Cancel and go back</button>
        </form>
      </div>
    </section>
  );
}
