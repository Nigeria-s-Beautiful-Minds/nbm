import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlainText } from "@/components/Prose";
import { ReportButton } from "@/components/ReportButton";
import { BlockHostForm, ThreadHostTools } from "@/components/ThreadHostTools";
import { ThreadView } from "@/components/ThreadView";
import { formatDate } from "@/lib/constants";
import { getThread, listMessages } from "@/lib/discussions";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const thread = await getThread(id, null);
  return thread ? { title: thread.title, description: thread.body.slice(0, 160) } : { title: "Discussion", robots: { index: false } };
}

export default async function ThreadPage({ params }: Params) {
  const { id } = await params;
  const viewer = await getViewer();
  const thread = await getThread(id, viewer);
  if (!thread) notFound();
  // A thread that is a room's text channel is read on the room page while the room is on.
  if (thread.room) redirect(`/discussion/rooms/${thread.room.id}`);

  const { messages, hasEarlier } = await listMessages(id, viewer?.id);
  const isModerator = can(viewer?.roles, "moderation");
  const pastRoom = await prisma.audioRoom.findFirst({ where: { threadId: id }, orderBy: { startsAt: "desc" }, select: { id: true } });
  const blocked = viewer && !thread.isHost ? Boolean(await prisma.userBlock.findFirst({ where: { blockerId: viewer.id, blockedId: thread.hostId }, select: { id: true } })) : false;

  return (
    <section className="page-section tight accent-discussion">
      <div className="shell">
        <p className="breadcrumb"><Link href="/discussion">Discussion</Link> / <Link href={`/discussion?topic=${encodeURIComponent(thread.topic)}`}>{thread.topic}</Link></p>
        <div className="sidebar-layout">
          <div>
            <div className="tags">
              <span className="tag">{thread.topic}</span>
              {thread.status !== "OPEN" && <span className="tag neutral">{thread.status === "LOCKED" ? "Locked" : "Archived"}</span>}
            </div>
            <h1 className="mt-2">{thread.title}</h1>
            <p className="muted">Hosted by {thread.hostName} · {formatDate(thread.createdAt)}</p>
            <PlainText text={thread.body} />
            {thread.referenceUrl && <p><a href={thread.referenceUrl} rel="noopener noreferrer nofollow">Reference link</a></p>}
            {thread.summary && (
              <div className="notice"><p><strong>Host&rsquo;s summary</strong></p><PlainText text={thread.summary} /></div>
            )}
            <ThreadView
              threadId={thread.id}
              initialStatus={thread.status}
              initialMessages={messages}
              initialHasEarlier={hasEarlier}
              canPost={Boolean(viewer?.emailVerified)}
              signedIn={Boolean(viewer)}
              viewerIsHost={thread.isHost}
              isModerator={isModerator}
            />
          </div>
          <aside className="stack">
            {(thread.isHost || isModerator) && <ThreadHostTools thread={thread} isModerator={isModerator} />}
            {pastRoom && <div className="panel"><h2>Audio room</h2><p className="mb-0">This conversation was the text channel of an <Link href={`/discussion/rooms/${pastRoom.id}`}>audio room</Link>.</p></div>}
            {viewer && !thread.isHost && (
              <div className="panel">
                <h2>Safety</h2>
                <div className="stack">
                  <ReportButton targetType="THREAD" targetId={thread.id} label="Report this conversation" />
                  <BlockHostForm userId={thread.hostId} name={thread.hostName} blocked={blocked} path={`/discussion/${thread.id}`} />
                  <p className="muted small mb-0">Blocking hides a person&rsquo;s messages from you and keeps them out of conversations and rooms you host. In other people&rsquo;s public conversations they can still read what you post.</p>
                </div>
              </div>
            )}
            <div className="panel">
              <h2>Good conversations</h2>
              <ul className="small mb-0">
                <li>Ask specific questions about the work.</li>
                <li>Share findings and lessons, including what didn&rsquo;t work.</li>
                <li>Say what is proposed, demonstrated or tested.</li>
              </ul>
              <p className="small mt-2 mb-0"><Link href="/community-standards">Community standards</Link></p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
