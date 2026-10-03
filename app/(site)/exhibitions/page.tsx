import type { Metadata } from "next";
import Link from "next/link";
import { ExhibitionCard, PageHero, Pagination } from "@/components/cards";
import { TOPICS } from "@/lib/constants";
import { EXHIBITIONS_PAGE_SIZE, listPublicExhibitions } from "@/lib/exhibitions";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = {
  title: "Exhibitions",
  description: "Research, prototypes, devices and software from Nigerian minds at home and abroad. Browse projects, react, comment and find collaborators."
};

export default async function ExhibitionsPage({ searchParams }: { searchParams: Promise<{ topic?: string; page?: string }> }) {
  const params = await searchParams;
  const topic = (TOPICS as readonly string[]).includes(params.topic ?? "") ? params.topic : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const [{ items, total }, viewer] = await Promise.all([listPublicExhibitions({ topic, page }), getViewer()]);
  const hrefFor = (p: number) => `/exhibitions?${new URLSearchParams({ ...(topic ? { topic } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="accent-exhibitions">
      <PageHero accent="accent-exhibitions" kicker="Exhibitions" title="Show the work.">
        <p className="lede">Research, prototypes, devices and software from Nigerians at home and abroad. Early ideas and unfinished work are welcome here, and every project says plainly what stage it has reached.</p>
        <div className="button-row">
          <Link className="button" href={viewer ? "/exhibitions/new" : "/login?callbackUrl=/exhibitions/new"}>Share your project</Link>
          {!viewer && <Link className="button secondary" href="/join">Join the community</Link>}
        </div>
      </PageHero>

      <section className="page-section tight">
        <div className="shell">
          <nav className="filters" aria-label="Filter by topic">
            <Link className={`chip${!topic ? " active" : ""}`} href="/exhibitions" aria-current={!topic ? "true" : undefined}>All topics</Link>
            {TOPICS.map((t) => (
              <Link key={t} className={`chip${topic === t ? " active" : ""}`} href={`/exhibitions?topic=${encodeURIComponent(t)}`} aria-current={topic === t ? "true" : undefined}>{t}</Link>
            ))}
          </nav>

          {items.length === 0 ? (
            <div className="empty-state">
              <h3>{topic ? `No projects in ${topic} yet` : "No projects have been published yet"}</h3>
              <p>Be the first to show what you&rsquo;re working on. Posts appear here once a reviewer has approved them.</p>
              <p><Link className="button" href={viewer ? "/exhibitions/new" : "/join"}>{viewer ? "Share your project" : "Join to share your project"}</Link></p>
            </div>
          ) : (
            <div className="grid cols-3">
              {items.map((post) => <ExhibitionCard key={post.id} post={post} />)}
            </div>
          )}
          <Pagination page={page} total={total} pageSize={EXHIBITIONS_PAGE_SIZE} hrefFor={hrefFor} />
        </div>
      </section>
    </div>
  );
}
