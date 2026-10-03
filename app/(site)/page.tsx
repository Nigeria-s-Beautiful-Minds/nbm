import Link from "next/link";
import { ExhibitionCard, FundingBar } from "@/components/cards";
import { LocalTime } from "@/components/LocalTime";
import { CAMPAIGN_KINDS, WORKING_MODES, formatDate } from "@/lib/constants";
import { listNews } from "@/lib/content";
import { listThreads } from "@/lib/discussions";
import { getFeaturedExhibitions } from "@/lib/exhibitions";
import { listPublishedOpportunities } from "@/lib/mentorship";
import { listActiveRooms } from "@/lib/rooms";
import { listOpenCampaigns } from "@/lib/sponsorship";
import { getViewer } from "@/lib/viewer";

// Every module below is filled from published records. A module with nothing to show is left
// out, rather than padded with placeholder cards or invented numbers.
export default async function HomePage() {
  const [viewer, exhibitions, rooms, threads, opportunities, campaigns, news] = await Promise.all([
    getViewer(),
    getFeaturedExhibitions(9),
    listActiveRooms(3),
    listThreads({ sort: "active" }),
    listPublishedOpportunities(),
    listOpenCampaigns(),
    listNews({ pageSize: 3 })
  ]);
  const conversations = threads.items.filter((t) => !t.room).slice(0, 3);

  return (
    <>
      <section className="hero">
        <picture>
          <source media="(max-width: 760px)" srcSet="/brand/nbm-hero-900.jpg" />
          <img className="hero-image" src="/brand/nbm-hero.jpg" alt="" width={1672} height={640} fetchPriority="high" />
        </picture>
        <div className="shell">
          <div className="hero-inner">
            <h1><em>Connect</em> Nigeria&rsquo;s Beautiful Minds</h1>
            <p>Bringing Nigerian researchers, innovators, students and professionals at home and across the world together to share ideas, build solutions and support the next generation.</p>
            <div className="button-row">
              <Link className="button on-dark" href="/exhibitions">Explore projects</Link>
              {viewer ? <Link className="button on-dark-outline" href="/exhibitions/new">Share your project</Link> : <Link className="button on-dark-outline" href="/join">Join the community</Link>}
            </div>
            <p className="hero-note">A Nigeria-first community for research, innovation and collaboration.</p>
          </div>
        </div>
      </section>

      <section className="page-section tight">
        <div className="shell">
          <ol className="journey" aria-label="How NBM works">
            <li><Link href="/exhibitions">Discover</Link></li>
            <li><Link href="/discussion">Discuss</Link></li>
            <li><Link href="/discussion">Collaborate</Link></li>
            <li><Link href="/mentorship">Mentor</Link></li>
            <li><Link href="/sponsorship">Support</Link></li>
            <li><Link href="/exhibitions">Build</Link></li>
          </ol>
        </div>
      </section>

      {exhibitions.length > 0 && (
        <section className="page-section tight accent-exhibitions">
          <div className="shell">
            <div className="section-head">
              <div><p className="kicker">Exhibitions</p><h2>Featured projects</h2></div>
              <Link className="section-link" href="/exhibitions">All projects →</Link>
            </div>
            <div className="grid cols-3">{exhibitions.map((post) => <ExhibitionCard key={post.id} post={post} />)}</div>
          </div>
        </section>
      )}

      {(rooms.length > 0 || conversations.length > 0) && (
        <section className="page-section tight tinted accent-discussion">
          <div className="shell">
            <div className="section-head">
              <div><p className="kicker">Discussion</p><h2>Live and upcoming conversations</h2></div>
              <Link className="section-link" href="/discussion">All conversations →</Link>
            </div>
            <div className="grid cols-3">
              {rooms.map((room) => (
                <article key={room.id} className="card linked top-accent">
                  <div className="card-body">
                    <div className="tags">{room.status === "LIVE" ? <span className="tag live">Live now</span> : <span className="tag neutral">Audio room</span>}<span className="tag">{room.topic}</span></div>
                    <h3><Link href={`/discussion/rooms/${room.id}`}>{room.title}</Link></h3>
                    <p className="card-meta"><span>Host: {room.hostName}</span>{room.status === "LIVE" ? <span>{room.participantCount} in the room</span> : <LocalTime iso={room.startsAt} />}</p>
                  </div>
                </article>
              ))}
              {conversations.slice(0, Math.max(0, 3 - rooms.length)).map((thread) => (
                <article key={thread.id} className="card linked top-accent">
                  <div className="card-body">
                    <div className="tags"><span className="tag">{thread.topic}</span></div>
                    <h3><Link href={`/discussion/${thread.id}`}>{thread.title}</Link></h3>
                    <p className="clamp-2">{thread.body}</p>
                    <p className="card-meta"><span>Host: {thread.hostName}</span><span>{thread.messageCount} repl{thread.messageCount === 1 ? "y" : "ies"}</span></p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {opportunities.length > 0 && (
        <section className="page-section tight accent-mentorship">
          <div className="shell">
            <div className="section-head">
              <div><p className="kicker">Mentorship</p><h2>Open mentorship opportunities</h2></div>
              <Link className="section-link" href="/mentorship">All opportunities →</Link>
            </div>
            <div className="grid cols-3">
              {opportunities.slice(0, 3).map((o) => (
                <article key={o.id} className="card linked top-accent">
                  <div className="card-body">
                    <div className="tags"><span className="tag">{o.topic}</span><span className="tag neutral">{WORKING_MODES[o.workingMode]}</span></div>
                    <h3><Link href={`/mentorship/opportunities/${o.id}`}>{o.title}</Link></h3>
                    <p className="clamp-2">{o.scope}</p>
                    <p className="card-meta"><span>{o.mentor.name}</span><span>{o.duration}</span></p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {campaigns.length > 0 && (
        <section className="page-section tight tinted accent-sponsorship">
          <div className="shell">
            <div className="section-head">
              <div><p className="kicker">Sponsorship</p><h2>Projects seeking support</h2></div>
              <Link className="section-link" href="/sponsorship">All campaigns →</Link>
            </div>
            <div className="grid cols-3">
              {campaigns.slice(0, 3).map((c) => (
                <article key={c.id} className="card linked top-accent">
                  <div className="card-body">
                    <div className="tags"><span className="tag">{CAMPAIGN_KINDS[c.kind] ?? c.kind}</span></div>
                    <h3><Link href={`/sponsorship/${c.slug}`}>{c.title}</Link></h3>
                    <FundingBar receivedMinor={c.totals.receivedMinor} targetMinor={c.targetMinor} currency={c.currency} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {news.items.length > 0 && (
        <section className="page-section tight accent-about">
          <div className="shell">
            <div className="section-head">
              <div><p className="kicker">News</p><h2>Recent news</h2></div>
              <Link className="section-link" href="/about/news">All news →</Link>
            </div>
            <div className="grid cols-3">
              {news.items.map((article) => (
                <article key={article.id} className="card linked">
                  <div className="card-body">
                    <div className="tags"><span className="tag">{article.category}</span></div>
                    <h3><Link href={`/about/news/${article.slug}`}>{article.title}</Link></h3>
                    <p className="clamp-2">{article.excerpt}</p>
                    <p className="card-meta"><span>{article.publishedAt ? formatDate(article.publishedAt) : ""}</span></p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="band">
        <div className="shell band-inner">
          <div>
            <h2>Talent has no borders. Neither should collaboration.</h2>
            <p>There are many ways to support research, innovation and the next generation of Nigerian talent: contribute, volunteer, join our mailing list or simply get in touch.</p>
          </div>
          <div className="button-row">
            <Link className="button on-dark" href="/get-involved">Get involved</Link>
            <Link className="button on-dark-outline" href="/mentorship/mentor">Become a mentor</Link>
          </div>
        </div>
      </section>
    </>
  );
}
