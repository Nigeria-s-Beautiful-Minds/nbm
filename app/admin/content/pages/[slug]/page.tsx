import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field } from "@/components/ActionForm";
import { savePageAction } from "@/lib/actions/admin";
import { formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/viewer";

export const metadata = { title: "Edit page" };

const TITLES: Record<string, string> = { about: "About Nigeria's Beautiful Minds", privacy: "Privacy Policy", terms: "Terms of use", "community-standards": "Community standards" };
const PUBLIC_PATH: Record<string, string> = { about: "/about", privacy: "/about/privacy", terms: "/terms", "community-standards": "/community-standards" };

export default async function EditPagePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireCapability("content.edit", "/admin/content");
  const { slug } = await params;
  if (!(slug in TITLES)) notFound();
  const versions = await prisma.pageVersion.findMany({ where: { slug }, orderBy: { version: "desc" } });
  const latest = versions[0];
  const policy = slug === "privacy" || slug === "terms";
  return (
    <>
      <p className="breadcrumb"><Link href="/admin/content">News, team and pages</Link> / {TITLES[slug]}</p>
      <h1>{TITLES[slug]}</h1>
      <p className="muted">You are editing {latest?.status === "DRAFT" ? `the draft of version ${latest.version}` : `a new version ${(latest?.version ?? 0) + 1}`}. Published versions are never changed in place, so the history below is kept. <Link href={PUBLIC_PATH[slug]}>View the public page</Link>.</p>
      <div className="panel">
        <ActionForm action={savePageAction} submitLabel="Publish this version" pendingLabel="Saving…">
          <input type="hidden" name="slug" value={slug} />
          <Field name="title" label="Title" required defaultValue={latest?.title ?? TITLES[slug]} />
          <Field name="effectiveDate" label="Effective date" type="date" full={false} defaultValue={latest?.status === "DRAFT" && latest.effectiveDate ? latest.effectiveDate.toISOString().slice(0, 10) : ""} hint="Defaults to today when published." />
          <Field name="body" label="Content" type="textarea" rows={22} required defaultValue={latest?.body} hint="Blank line between paragraphs. ## Heading, - bullet, **bold**, [link text](https://example.org)." />
          {policy && <Field name="reviewed" type="checkbox" label="The founder has had this policy reviewed and has approved it for publication" hint="Required to publish. It must describe the data NBM actually collects." />}
          {/* The hidden value is the default; the draft button, coming later in the form, overrides it when pressed. */}
          <input type="hidden" name="intent" value="publish" />
          <div className="full"><button className="button secondary" type="submit" name="intent" value="draft">Save as draft</button></div>
        </ActionForm>
      </div>
      <h2 className="mt-3">Version history</h2>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Version</th><th>Status</th><th>Effective</th><th>Saved</th></tr></thead>
          <tbody>
            {versions.length === 0 && <tr><td colSpan={4}>No versions yet.</td></tr>}
            {versions.map((v) => <tr key={v.id}><td>v{v.version}</td><td>{v.status.toLowerCase()}</td><td>{v.effectiveDate ? formatDate(v.effectiveDate) : "—"}</td><td>{formatDate(v.updatedAt)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
