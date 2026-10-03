import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field } from "@/components/ActionForm";
import { VerifyNotice } from "@/components/VerifyNotice";
import { createThreadAction } from "@/lib/actions/discussion";
import { TEXT_LIMITS, TOPICS } from "@/lib/constants";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Start a conversation", robots: { index: false } };

export default async function NewThreadPage() {
  const viewer = await requireViewer("/discussion/new");
  return (
    <section className="page-section accent-discussion">
      <div className="shell narrow">
        <p className="breadcrumb"><Link href="/discussion">Discussion</Link> / New conversation</p>
        <h1>Start a conversation</h1>
        <p className="lede">You will be the host. You can lock the conversation or remove disruptive replies in it at any time.</p>
        {!viewer.emailVerified ? <VerifyNotice what="start a conversation" /> : (
          <div className="panel">
            <ActionForm action={createThreadAction} submitLabel="Start conversation" pendingLabel="Starting…">
              <Field name="title" label="Title" required maxLength={TEXT_LIMITS.title} placeholder="What do you want to talk about?" />
              <Field name="topic" label="Topic" type="select" options={TOPICS} required />
              <Field name="body" label="Opening message" type="textarea" rows={6} required maxLength={TEXT_LIMITS.message} placeholder="Set out the question, finding or idea, and what kind of replies would help." />
              <Field name="referenceUrl" label="Link to a project, article or paper" type="url" placeholder="https://" hint="For example an exhibition or news article on NBM, or published research." />
            </ActionForm>
          </div>
        )}
      </div>
    </section>
  );
}
