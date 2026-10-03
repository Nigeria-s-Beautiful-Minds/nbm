import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field } from "@/components/ActionForm";
import { PageHero } from "@/components/cards";
import { mailingListAction } from "@/lib/actions/involved";

export const metadata: Metadata = { title: "Join our mailing list", description: "Occasional email updates from Nigeria's Beautiful Minds." };

export default function MailingListPage() {
  return (
    <div className="accent-involved">
      <PageHero accent="accent-involved" kicker="Get Involved" title="Join our mailing list">
        <p className="lede">Occasional updates on projects, opportunities and calls for applications. No more than a couple of emails a month.</p>
      </PageHero>
      <section className="page-section tight">
        <div className="shell narrow">
          <div className="panel">
            <ActionForm action={mailingListAction} submitLabel="Subscribe" hideOnSuccess>
              <Field name="email" label="Email" type="email" required autoComplete="email" />
              <Field name="name" label="Name" autoComplete="name" />
              <Field name="consent" type="checkbox" required label="Yes, email me updates from Nigeria's Beautiful Minds. I can unsubscribe at any time." />
            </ActionForm>
          </div>
          <p className="muted small mt-2">We&rsquo;ll send one email asking you to confirm, and add you only after you click it. Every email has an unsubscribe link. See our <Link href="/about/privacy">privacy policy</Link>. Having an NBM account does not subscribe you.</p>
        </div>
      </section>
    </div>
  );
}
