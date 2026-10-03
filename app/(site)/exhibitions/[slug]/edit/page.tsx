import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExhibitionEditor } from "@/components/ExhibitionEditor";
import { getLimits } from "@/lib/config";
import { getExhibitionForViewer } from "@/lib/exhibitions";
import { linkOptionsFor } from "@/lib/exhibition-editor";
import { can } from "@/lib/permissions";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Edit your post", robots: { index: false } };

type Params = { params: Promise<{ slug: string }> };

export default async function EditExhibitionPage({ params }: Params) {
  const { slug } = await params;
  const viewer = await requireViewer(`/exhibitions/${slug}/edit`);
  const post = await getExhibitionForViewer(slug, viewer);
  // Only the author edits a post; reviewers act on it from the staff tools instead.
  if (!post || !post.isOwn || post.status === "REMOVED") notFound();
  const [limits, links] = await Promise.all([getLimits(), linkOptionsFor(viewer.id)]);

  // If an edit is awaiting review, keep working from that edit rather than the published version.
  const revision = post.pendingRevision;
  const values = revision ?? {
    title: post.title,
    description: post.description,
    topic: post.topic,
    stage: post.stage,
    teamCredits: post.teamCredits ?? "",
    projectUrl: post.projectUrl ?? "",
    linkedThreadId: post.linkIds.threadId,
    linkedOpportunityId: post.linkIds.opportunityId,
    linkedCampaignId: post.linkIds.campaignId,
    media: []
  };
  const byUpload = new Map(post.allMedia.map((m) => [m.uploadId, m]));
  const media = revision
    ? revision.media.flatMap((m) => { const item = byUpload.get(m.uploadId); return item ? [{ ...item, alt: m.alt }] : []; })
    : post.media;

  return (
    <section className="page-section accent-exhibitions">
      <div className="shell medium">
        <p className="breadcrumb"><Link href="/account/workspace">My workspace</Link> / Edit post</p>
        <h1>Edit your post</h1>
        <div className="panel">
          <ExhibitionEditor
            initial={{ id: post.id, slug: post.slug, status: post.status, revisionStatus: post.revisionStatus, moderationNote: post.moderationNote, values, media }}
            limits={limits}
            canPublishDirect={can(viewer.roles, "exhibitions.publishDirect")}
            links={links}
          />
        </div>
      </div>
    </section>
  );
}
