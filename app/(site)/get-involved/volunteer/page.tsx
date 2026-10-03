import type { Metadata } from "next";
import { ActionForm, Field } from "@/components/ActionForm";
import { PageHero } from "@/components/cards";
import { volunteerAction } from "@/lib/actions/involved";
import { getCommittees } from "@/lib/config";

export const metadata: Metadata = { title: "Volunteer", description: "Volunteer with an NBM committee: events, mentorship, outreach or project review." };

export default async function VolunteerPage() {
  const committees = await getCommittees();
  return (
    <div className="accent-involved">
      <PageHero accent="accent-involved" kicker="Get Involved" title="Volunteer">
        <p className="lede">NBM runs on people giving a few focused hours. Tell us what you&rsquo;d like to help with and we&rsquo;ll be in touch.</p>
      </PageHero>
      <section className="page-section tight">
        <div className="shell narrow">
          <div className="panel">
            <ActionForm action={volunteerAction} submitLabel="Send application" hideOnSuccess>
              <Field name="name" label="Full name" required full={false} autoComplete="name" />
              <Field name="email" label="Email" type="email" required full={false} autoComplete="email" />
              <Field name="committee" label="Committee preference" type="select" required options={committees} />
              <Field name="interests" label="What interests you about NBM?" type="textarea" rows={3} required />
              <Field name="skills" label="Relevant skills or experience" type="textarea" rows={3} required />
              <Field name="availability" label="Availability" required placeholder="e.g. 3 hours a week, evenings WAT" />
            </ActionForm>
          </div>
          <p className="muted small mt-2">Your application is private and seen only by NBM staff. Sending it confirms receipt, not acceptance.</p>
        </div>
      </section>
    </div>
  );
}
