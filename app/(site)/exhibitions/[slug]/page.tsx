import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExhibitionComments, ExhibitionEngagement, Gallery } from "@/components/ExhibitionView";
import { PlainText } from "@/components/Prose";
import { PROJECT_STAGES, formatDate } from "@/lib/constants";
import { EXHIBITION_STATUS_LABELS, getExhibitionForViewer, listComments } from "@/lib/exhibitions";
import { can } from "@/lib/permissions";
import { getViewer } from "@/lib/viewer";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  // Metadata is built for a visitor, so an unpublished post never leaks its title into a preview.
  const post = await getExhibitionForViewer(slug, null);
  if (!post) return { title: "Exhibitions", robots: { index: false } };
  return {
    title: post.title,
    description: post.description.slice(0, 160),
    openGraph: { title: post.title, description: post.description.slice(0, 160), type: "article", ...(post.cover?.kind === "IMAGE" ? { images: [{ url: post.cover.url, alt: post.cover.alt }] } : {}) }
  };
}

export default async function ExhibitionPage({ params }: Params) {
  const { slug } = await params;
  const viewer = await getViewer();
  const post = await getExhibitionForViewer(slug, viewer);
  if (!post) notFound();

  const isPublic = post.status === "APPROVED";
  const comments = isPublic ? await listComments(post.id, viewer) : [];
  const canInteract = Boolean(viewer?.emailVerified) && isPublic;

  return (
    <section className="page-section tight accent-exhibitions">
      <div className="shell">
        <p className="breadcrumb"><Link href="/exhibitions">Exhibitions</Link> / <Link href={`/exhibitions?topic=${encodeURIComponent(post.topic)}`}>{post.topic}</Link></p>

        {!isPublic && (
          <div className="notice warn">
            <p><strong>{EXHIBITION_STATUS_LABELS[post.status]}.</strong> Only you and our reviewers can see this page.{post.moderationNote ? ` Reviewer's note: ${post.moderationNote}` : ""}</p>
          </div>
        )}
        {isPublic && post.isOwn && post.revisionStatus === "PENDING" && (
          <div className="notice"><p>Your latest edit is awaiting review. Visitors see the approved version below until then.</p></div>
        )}

        <div className="sidebar-layout">
          <article>
            <Gallery media={post.media} />
            <div className="tags mt-2">
              <span className="tag">{post.topic}</span>
              <span className="tag neutral">Stage: {PROJECT_STAGES[post.stage] ?? post.stage}</span>
            </div>
            <h1 className="mt-2">{post.title}</h1>
            <p className="muted">By {post.authorName} · {formatDate(post.publishedAt ?? post.createdAt)}</p>
            <PlainText text={post.description} />
            {isPublic && <ExhibitionEngagement post={post} canInteract={canInteract} signedIn={Boolean(viewer)} />}
            {isPublic && <ExhibitionComments postId={post.id} slug={post.slug} initialComments={comments} canInteract={canInteract} isModerator={can(viewer?.roles, "moderation")} />}
          </article>

          <aside className="stack">
            {post.isOwn && (
              <div className="panel">
                <h2>Your post</h2>
                <p className="small muted">Status: {EXHIBITION_STATUS_LABELS[post.status]}</p>
                <Link className="button secondary small" href={`/exhibitions/${post.slug}/edit`}>Edit post</Link>
              </div>
            )}
            <div className="panel">
              <h2>About this project</h2>
              <dl className="facts">
                <dt>Stage</dt><dd>{PROJECT_STAGES[post.stage] ?? post.stage}</dd>
                <dt>Topic</dt><dd>{post.topic}</dd>
                {post.teamCredits && (<><dt>Team</dt><dd>{post.teamCredits}</dd></>)}
                {post.projectUrl && (<><dt>Link</dt><dd><a href={post.projectUrl} rel="noopener noreferrer nofollow" target="_blank">Project website</a></dd></>)}
              </dl>
            </div>
            {(post.links.thread || post.links.opportunity || post.links.campaign) && (
              <div className="panel">
                <h2>Take it further</h2>
                <div className="stack">
                  {post.links.thread && <p className="mb-0"><span className="tag accent-discussion">Discussion</span><br /><Link href={`/discussion/${post.links.thread.id}`}>{post.links.thread.title}</Link></p>}
                  {post.links.opportunity && <p className="mb-0"><span className="tag accent-mentorship">Mentorship</span><br /><Link href={`/mentorship/opportunities/${post.links.opportunity.id}`}>{post.links.opportunity.title}</Link></p>}
                  {post.links.campaign && <p className="mb-0"><span className="tag accent-sponsorship">Sponsorship</span><br /><Link href={`/sponsorship/${post.links.campaign.slug}`}>{post.links.campaign.title}</Link></p>}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
