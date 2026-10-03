import Link from "next/link";
import { ActionForm, Field } from "@/components/ActionForm";
import { reviewExhibitionAction } from "@/lib/actions/admin";
import { PROJECT_STAGES, formatDate } from "@/lib/constants";
import type { ExhibitionInput } from "@/lib/exhibitions-shared";
import { prisma } from "@/lib/prisma";
import { mediaUrl } from "@/lib/uploads";
import { requireCapability } from "@/lib/viewer";

export const metadata = { title: "Exhibition review" };

function Decide({ id, decision, label, needsReason, danger }: { id: string; decision: string; label: string; needsReason?: boolean; danger?: boolean }) {
  return (
    <ActionForm action={reviewExhibitionAction} submitLabel={label} className="inline-form" buttonClassName={`button small${danger ? " danger" : decision.startsWith("approve") ? "" : " secondary"}`}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value={decision} />
      {needsReason && <Field name="reason" label="Reason (shared with the author)" required full={false} />}
    </ActionForm>
  );
}

export default async function AdminExhibitionsPage() {
  await requireCapability("exhibitions.review", "/admin/exhibitions");
  const include = { author: { select: { name: true } }, media: { orderBy: { sortOrder: "asc" as const } } };
  const [pending, revisions, published] = await Promise.all([
    prisma.exhibition.findMany({ where: { status: "PENDING" }, orderBy: { updatedAt: "asc" }, include }),
    prisma.exhibition.findMany({ where: { status: "APPROVED", revisionStatus: "PENDING" }, orderBy: { updatedAt: "asc" }, include }),
    prisma.exhibition.findMany({ where: { status: "APPROVED" }, orderBy: { publishedAt: "desc" }, take: 50, include })
  ]);
  const Media = ({ items }: { items: { uploadId: string; kind: string; alt: string }[] }) => (
    <div className="gallery-thumbs">
      {items.map((m) => (
        <a key={m.uploadId} href={mediaUrl(m.uploadId)} target="_blank" rel="noopener noreferrer" className="gallery-thumb" title={m.alt}>
          {m.kind === "IMAGE" ? <img src={mediaUrl(m.uploadId)} alt={m.alt} loading="lazy" /> : <video src={mediaUrl(m.uploadId)} preload="metadata" muted />}
        </a>
      ))}
    </div>
  );

  return (
    <>
      <h1>Exhibition review</h1>
      <p className="muted">Member posts wait here until approved. A rejection or removal needs a reason, which the author sees and which is kept in the action history.</p>

      <h2 className="mt-3">Awaiting review ({pending.length})</h2>
      {pending.length === 0 ? <p className="status">Nothing waiting.</p> : (
        <div className="record-list">
          {pending.map((post) => (
            <article key={post.id} className="record">
              <div className="record-head">
                <h3><Link href={`/exhibitions/${post.slug}`}>{post.title}</Link></h3>
                <span className="tag">{post.topic}</span><span className="tag neutral">{PROJECT_STAGES[post.stage] ?? post.stage}</span>
                <span className="muted small">{post.author.name} · {formatDate(post.updatedAt)}</span>
              </div>
              <Media items={post.media} />
              <p className="mt-2" style={{ whiteSpace: "pre-wrap" }}>{post.description}</p>
              <div className="record-actions">
                <Decide id={post.id} decision="approve" label="Approve and publish" />
                <Decide id={post.id} decision="reject" label="Reject" needsReason danger />
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className="mt-3">Edits to published posts ({revisions.length})</h2>
      {revisions.length === 0 ? <p className="status">Nothing waiting.</p> : (
        <div className="record-list">
          {revisions.map((post) => {
            const revision = post.pendingRevision as unknown as ExhibitionInput;
            return (
              <article key={post.id} className="record">
                <div className="record-head"><h3><Link href={`/exhibitions/${post.slug}`}>{post.title}</Link></h3><span className="muted small">{post.author.name}</span></div>
                <p className="small muted">The approved version stays public until you decide. Proposed version:</p>
                <p><strong>{revision.title}</strong></p>
                <Media items={revision.media} />
                <p className="mt-2" style={{ whiteSpace: "pre-wrap" }}>{revision.description}</p>
                <div className="record-actions">
                  <Decide id={post.id} decision="approve-revision" label="Approve edit" />
                  <Decide id={post.id} decision="reject-revision" label="Reject edit" needsReason danger />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <h2 className="mt-3">Published</h2>
      {published.length === 0 ? <p className="status">No published posts yet.</p> : (
        <div className="record-list">
          {published.map((post) => (
            <article key={post.id} className="record">
              <div className="record-head">
                <h3><Link href={`/exhibitions/${post.slug}`}>{post.title}</Link></h3>
                {post.featured && <span className="tag gold">Featured on Home</span>}
                <span className="muted small">{post.author.name} · {post.publishedAt ? formatDate(post.publishedAt) : ""}</span>
              </div>
              <div className="record-actions">
                <Decide id={post.id} decision={post.featured ? "unfeature" : "feature"} label={post.featured ? "Stop featuring" : "Feature on Home"} />
                <Decide id={post.id} decision="remove" label="Remove from public view" needsReason danger />
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
