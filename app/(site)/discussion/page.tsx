import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Pagination } from "@/components/cards";
import { LocalTime } from "@/components/LocalTime";
import { TOPICS, formatDate } from "@/lib/constants";
import { THREADS_PAGE_SIZE, listThreads } from "@/lib/discussions";
import { listActiveRooms } from "@/lib/rooms";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = {
  title: "Discussion",
  description: "Text conversations and live audio rooms about research, ideas and development priorities, hosted by NBM members."
};

export default async function DiscussionPage({ searchParams }: { searchParams: Promise<{ topic?: string; sort?: string; page?: string }> }) {
  const params = await searchParams;
  const topic = (TOPICS as readonly string[]).includes(params.topic ?? "") ? params.topic : undefined;
  const sort = params.sort === "active" ? "active" : "recent";
  const page = Math.max(1, Number(params.page) || 1);
  const [{ items, total }, rooms, viewer] = await Promise.all([listThreads({ sort, topic, page }), listActiveRooms(6), getViewer()]);
  const query = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { topic, sort: sort === "active" ? "active" : undefined, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const text = next.toString();
    return `/discussion${text ? `?${text}` : ""}`;
  };
  const gate = (path: string) => (viewer ? path : `/login?callbackUrl=${path}`);

  return (
    <div className="accent-discussion">
      <PageHero accent="accent-discussion" kicker="Discussion" title="Start the conversation.">
        <p className="lede">Ask about a project, share a finding or a lesson learned, or host a live audio room. You don&rsquo;t need seniority to contribute: a good question is welcome from anyone.</p>
        <div className="button-row">
          <Link className="button" href={gate("/discussion/new")}>Start a conversation</Link>
          <Link className="button secondary" href={gate("/discussion/rooms/new")}>Host an audio room</Link>
        </div>
      </PageHero>

      {rooms.length > 0 && (
        <section className="page-section tight">
          <div className="shell">
            <div className="section-head"><h2>Live and upcoming audio rooms</h2></div>
            <div className="grid cols-3">
              {rooms.map((room) => (
                <article key={room.id} className="card linked top-accent">
                  <div className="card-body">
                    <div className="tags">
                      {room.status === "LIVE" ? <span className="tag live">Live now</span> : <span className="tag neutral">Scheduled</span>}
                      <span className="tag">{room.topic}</span>
                    </div>
                    <h3><Link href={`/discussion/rooms/${room.id}`}>{room.title}</Link></h3>
                    <p className="clamp-2">{room.description}</p>
                    <p className="card-meta">
                      <span>Host: {room.hostName}</span>
                      {room.status === "LIVE" ? <span>{room.participantCount} in the room</span> : <LocalTime iso={room.startsAt} />}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="page-section tight">
        <div className="shell">
          <div className="section-head"><h2>Conversations</h2></div>
          <nav className="filters" aria-label="Sort conversations">
            <Link className={`chip${sort === "recent" ? " active" : ""}`} href={query({ sort: undefined, page: undefined })}>Recent</Link>
            <Link className={`chip${sort === "active" ? " active" : ""}`} href={query({ sort: "active", page: undefined })}>Most active</Link>
          </nav>
          <nav className="filters" aria-label="Filter by topic">
            <Link className={`chip${!topic ? " active" : ""}`} href={query({ topic: undefined, page: undefined })}>All topics</Link>
            {TOPICS.map((t) => <Link key={t} className={`chip${topic === t ? " active" : ""}`} href={query({ topic: t, page: undefined })}>{t}</Link>)}
          </nav>

          {items.length === 0 ? (
            <div className="empty-state">
              <h3>No conversations here yet</h3>
              <p>Start one: ask a question about a project, or invite others to work on a problem with you.</p>
              <p><Link className="button" href={gate("/discussion/new")}>Start a conversation</Link></p>
            </div>
          ) : (
            <div className="record-list">
              {items.map((thread) => (
                <article key={thread.id} className="card linked plain">
                  <div className="card-body">
                    <div className="tags">
                      <span className="tag">{thread.topic}</span>
                      {thread.status === "LOCKED" && <span className="tag neutral">Locked</span>}
                      {thread.room && <span className={`tag ${thread.room.status === "LIVE" ? "live" : "neutral"}`}>{thread.room.status === "LIVE" ? "Audio room live" : "Audio room scheduled"}</span>}
                    </div>
                    <h3><Link href={thread.room ? `/discussion/rooms/${thread.room.id}` : `/discussion/${thread.id}`}>{thread.title}</Link></h3>
                    <p className="clamp-2">{thread.body}</p>
                    <p className="card-meta">
                      <span>Host: {thread.hostName}</span>
                      <span>{thread.messageCount} repl{thread.messageCount === 1 ? "y" : "ies"}</span>
                      <span>Started {formatDate(thread.createdAt)}</span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
          <Pagination page={page} total={total} pageSize={THREADS_PAGE_SIZE} hrefFor={(p) => query({ page: p > 1 ? String(p) : undefined })} />
        </div>
      </section>
    </div>
  );
}
