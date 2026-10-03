import type { Metadata } from "next";
import Link from "next/link";
import { ExhibitionEditor } from "@/components/ExhibitionEditor";
import { getLimits } from "@/lib/config";
import { linkOptionsFor } from "@/lib/exhibition-editor";
import { can } from "@/lib/permissions";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Share your project", robots: { index: false } };

export default async function NewExhibitionPage() {
  const viewer = await requireViewer("/exhibitions/new");
  const [limits, links] = await Promise.all([getLimits(), linkOptionsFor(viewer.id)]);

  return (
    <section className="page-section accent-exhibitions">
      <div className="shell medium">
        <p className="breadcrumb"><Link href="/exhibitions">Exhibitions</Link> / New post</p>
        <h1>Share your project</h1>
        {!viewer.emailVerified ? (
          <div className="notice warn">
            <p>Please confirm your email address before posting. We sent a link when you joined; you can request a new one from your <Link href="/account/settings">account settings</Link>.</p>
          </div>
        ) : (
          <div className="panel">
            <ExhibitionEditor initial={null} limits={limits} canPublishDirect={can(viewer.roles, "exhibitions.publishDirect")} links={links} />
          </div>
        )}
      </div>
    </section>
  );
}
