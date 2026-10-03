import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Pagination } from "@/components/cards";
import { formatDate } from "@/lib/constants";
import { NEWS_CATEGORIES, NEWS_PAGE_SIZE, coverUrl, listNews } from "@/lib/content";

export const metadata: Metadata = { title: "News", description: "News and announcements from Nigeria's Beautiful Minds." };

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; page?: string }> }) {
  const params = await searchParams;
  const category = (NEWS_CATEGORIES as readonly string[]).includes(params.category ?? "") ? params.category : undefined;
  const q = params.q?.trim().slice(0, 80) || undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const { items, total } = await listNews({ category, q, page });
  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ category, q, ...changes })) if (value) next.set(key, value);
    return `/about/news${next.size ? `?${next}` : ""}`;
  };

  return (
    <div className="accent-about">
      <PageHero accent="accent-about" kicker="About" title="News">
        <p className="lede">Announcements, community stories and opportunities from the NBM team.</p>
      </PageHero>
      <section className="page-section tight">
        <div className="shell">
          <form className="search-form" action="/about/news" role="search">
            <label className="sr-only" htmlFor="news-q">Search news</label>
            <input id="news-q" className="field" type="search" name="q" defaultValue={q} placeholder="Search news" />
            {category && <input type="hidden" name="category" value={category} />}
            <button className="button secondary" type="submit">Search</button>
          </form>
          <nav className="filters" aria-label="Filter by category">
            <Link className={`chip${!category ? " active" : ""}`} href={href({ category: undefined, page: undefined })}>All</Link>
            {NEWS_CATEGORIES.map((c) => <Link key={c} className={`chip${category === c ? " active" : ""}`} href={href({ category: c, page: undefined })}>{c}</Link>)}
          </nav>
          {items.length === 0 ? (
            <div className="empty-state"><h3>{q || category ? "No articles match" : "No news yet"}</h3><p>{q || category ? "Try a different search or category." : "Articles will appear here as the team publishes them."}</p></div>
          ) : (
            <div className="grid cols-3">
              {items.map((article) => (
                <article key={article.id} className="card linked">
                  {article.coverUploadId && <div className="card-media"><img src={coverUrl(article.coverUploadId)!} alt={article.coverAlt ?? ""} loading="lazy" /></div>}
                  <div className="card-body">
                    <div className="tags"><span className="tag">{article.category}</span></div>
                    <h3><Link href={`/about/news/${article.slug}`}>{article.title}</Link></h3>
                    <p className="clamp-3">{article.excerpt}</p>
                    <p className="card-meta"><span>{article.author?.name ?? "NBM team"}</span><span>{article.publishedAt ? formatDate(article.publishedAt) : ""}</span></p>
                  </div>
                </article>
              ))}
            </div>
          )}
          <Pagination page={page} total={total} pageSize={NEWS_PAGE_SIZE} hrefFor={(p) => href({ page: p > 1 ? String(p) : undefined })} />
        </div>
      </section>
    </div>
  );
}
