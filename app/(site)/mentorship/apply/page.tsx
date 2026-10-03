import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field } from "@/components/ActionForm";
import { DocumentUpload } from "@/components/DocumentUpload";
import { VerifyNotice } from "@/components/VerifyNotice";
import { saveApplicationAction } from "@/lib/actions/mentorship";
import { getLimits } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Mentorship application", robots: { index: false } };

export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ opportunity?: string; application?: string; saved?: string }> }) {
  const params = await searchParams;
  const viewer = await requireViewer(`/mentorship/apply${params.opportunity ? `?opportunity=${params.opportunity}` : ""}`);
  // Only the applicant's own draft can be reopened here.
  const draft = params.application ? await prisma.mentorshipApplication.findFirst({ where: { id: params.application, applicantId: viewer.id, status: "DRAFT" } }) : null;
  if (params.application && !draft) notFound();
  const opportunityId = draft?.opportunityId ?? params.opportunity ?? null;
  const opportunity = opportunityId ? await prisma.opportunity.findFirst({ where: { id: opportunityId, status: "PUBLISHED" }, select: { id: true, title: true } }) : null;
  if (opportunityId && !opportunity) notFound();
  const limits = await getLimits();

  return (
    <section className="page-section accent-mentorship">
      <div className="shell narrow">
        <p className="breadcrumb"><Link href="/mentorship">Mentorship</Link> / Application</p>
        <h1>{opportunity ? "Apply for an opportunity" : "Request a mentorship match"}</h1>
        {opportunity ? <p className="lede">You are applying for <Link href={`/mentorship/opportunities/${opportunity.id}`}>{opportunity.title}</Link>.</p>
          : <p className="lede">Tell us what you want to work on. A coordinator will look for a suitable mentor and project and propose a match.</p>}
        <div className="notice">
          <p><strong>Who sees this:</strong> NBM coordinators. A mentor sees it only if a coordinator proposes a match with them. It is never public.</p>
        </div>
        {params.saved === "1" && <p className="status success" role="status">Draft saved. You can come back to it from your workspace.</p>}
        {!viewer.emailVerified ? <VerifyNotice what="apply" /> : (
          <div className="panel mt-2">
            <ActionForm action={saveApplicationAction} submitLabel="Submit application" pendingLabel="Saving…">
              {draft && <input type="hidden" name="applicationId" value={draft.id} />}
              {opportunity && <input type="hidden" name="opportunityId" value={opportunity.id} />}
              <Field name="interests" label="What are you interested in?" type="textarea" rows={3} required defaultValue={draft?.interests} />
              <Field name="experience" label="Relevant experience, coursework or projects" type="textarea" rows={4} required defaultValue={draft?.experience} hint="Informal and self-taught work counts. You don't need publications." />
              <Field name="motivation" label="Why do you want this?" type="textarea" rows={3} required defaultValue={draft?.motivation} />
              <Field name="goals" label="What do you hope to learn or produce?" type="textarea" rows={3} required defaultValue={draft?.goals} />
              <Field name="availability" label="Availability" required full={false} defaultValue={draft?.availability} placeholder="e.g. 8 hours a week for 3 months" />
              <Field name="location" label="Where are you based?" required full={false} defaultValue={draft?.location ?? ""} />
              <DocumentUpload name="documentUploadId" initialUploadId={draft?.documentUploadId ?? null} maxMb={limits.documentMaxMb} />
              <div className="full">
                <button className="button secondary" type="submit" name="intent" value="draft" formNoValidate>Save as draft</button>
              </div>
            </ActionForm>
          </div>
        )}
      </div>
    </section>
  );
}
