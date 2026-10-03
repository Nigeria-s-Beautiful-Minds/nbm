import type { Metadata } from "next";
import { ActionForm, Field } from "@/components/ActionForm";
import { PageHero } from "@/components/cards";
import { IdempotencyKey } from "@/components/IdempotencyKey";
import { contactAction } from "@/lib/actions/involved";
import { CONTACT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = { title: "Contact us", description: "Send a message to the Nigeria's Beautiful Minds team." };

export default function ContactPage() {
  return (
    <div className="accent-involved">
      <PageHero accent="accent-involved" kicker="Get Involved" title="Contact us">
        <p className="lede">Questions, ideas, partnerships or press: send us a message and a member of the team will reply by email.</p>
        <p>Or email us directly at <a href={`mailto:${CONTACT_EMAIL}`}><strong>{CONTACT_EMAIL}</strong></a>.</p>
      </PageHero>
      <section className="page-section tight">
        <div className="shell narrow">
          <div className="panel">
            <ActionForm action={contactAction} submitLabel="Send message" hideOnSuccess>
              <IdempotencyKey />
              <Field name="name" label="Your name" required full={false} autoComplete="name" />
              <Field name="email" label="Email" type="email" required full={false} autoComplete="email" />
              <Field name="subject" label="Subject" required maxLength={180} />
              <Field name="message" label="Message" type="textarea" rows={6} required maxLength={5000} />
            </ActionForm>
          </div>
          <p className="muted small mt-2">To report content or behaviour on the platform, use the Report button beside it so moderators see it straight away.</p>
        </div>
      </section>
    </div>
  );
}
