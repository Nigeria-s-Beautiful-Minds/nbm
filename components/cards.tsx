import Link from "next/link";
import { PROJECT_STAGES, formatDate, formatMoney } from "@/lib/constants";
import type { ExhibitionSummary } from "@/lib/exhibitions-shared";

export function ExhibitionCard({ post, showStatus = false }: { post: ExhibitionSummary; showStatus?: boolean }) {
  return (
    <article className="card linked accent-exhibitions">
      <div className="card-media">
        {!post.cover ? <span>NO MEDIA YET</span>
          : post.cover.kind === "IMAGE"
            ? <img src={post.cover.url} alt={post.cover.alt} loading="lazy" width={post.cover.width ?? undefined} height={post.cover.height ?? undefined} />
            // metadata only: the first frame shows, but nothing plays or downloads until asked.
            : <video src={post.cover.url} preload="metadata" muted playsInline aria-label={post.cover.alt} />}
      </div>
      <div className="card-body">
        <div className="tags">
          <span className="tag">{post.topic}</span>
          <span className="tag neutral">{PROJECT_STAGES[post.stage] ?? post.stage}</span>
          {showStatus && post.status !== "APPROVED" && <span className="tag warn">{post.status === "PENDING" ? "Awaiting review" : post.status.toLowerCase()}</span>}
        </div>
        <h3><Link href={`/exhibitions/${post.slug}`}>{post.title}</Link></h3>
        <p className="clamp-2">{post.description}</p>
        <p className="card-meta">
          <span>{post.authorName}</span>
          <span>{formatDate(post.publishedAt ?? post.createdAt)}</span>
          <span>{post.reactionTotal} reaction{post.reactionTotal === 1 ? "" : "s"}</span>
          <span>{post.commentCount} comment{post.commentCount === 1 ? "" : "s"}</span>
        </p>
      </div>
    </article>
  );
}

export function FundingBar({ receivedMinor, targetMinor, currency }: { receivedMinor: number; targetMinor: number; currency: string }) {
  const percent = targetMinor > 0 ? Math.min(100, Math.round((receivedMinor / targetMinor) * 100)) : 0;
  return (
    <div>
      <div className="fund-figures">
        <span><strong>{formatMoney(receivedMinor, currency)}</strong> received</span>
        <span>of {formatMoney(targetMinor, currency)}</span>
      </div>
      <div className="fund-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${percent}% of the funding target received`}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function Pagination({ page, total, pageSize, hrefFor }: { page: number; total: number; pageSize: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pages">
      {page > 1 ? <Link className="button secondary small" href={hrefFor(page - 1)} rel="prev">← Newer</Link> : <span />}
      <span className="muted small">Page {page} of {pages}</span>
      {page < pages ? <Link className="button secondary small" href={hrefFor(page + 1)} rel="next">Older →</Link> : <span />}
    </nav>
  );
}

export function PageHero({ accent, kicker, title, children }: { accent: string; kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <section className={`page-hero ${accent}`}>
      <div className="shell">
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
        {children}
      </div>
    </section>
  );
}
