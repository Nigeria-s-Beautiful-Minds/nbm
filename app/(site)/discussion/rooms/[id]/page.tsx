import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlainText } from "@/components/Prose";
import { RoomPanel } from "@/components/RoomPanel";
import { ThreadHostTools } from "@/components/ThreadHostTools";
import { ThreadView } from "@/components/ThreadView";
import { getThread, listMessages } from "@/lib/discussions";
import { livekitConfigured } from "@/lib/livekit";
import { can } from "@/lib/permissions";
import { getRoom, roomState } from "@/lib/rooms";
import { getViewer } from "@/lib/viewer";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const room = await getRoom(id);
  return room ? { title: `${room.title} (audio room)`, description: room.description.slice(0, 160) } : { title: "Audio room", robots: { index: false } };
}

export default async function RoomPage({ params }: Params) {
  const { id } = await params;
  const viewer = await getViewer();
  const room = await getRoom(id, viewer?.id);
  if (!room) notFound();
  const thread = await getThread(room.threadId, viewer);
  if (!thread) notFound();
  const [state, { messages, hasEarlier }] = await Promise.all([roomState(id, viewer, false), listMessages(room.threadId, viewer?.id)]);
  if (!state) notFound();
  const isModerator = can(viewer?.roles, "moderation");

  return (
    <section className="page-section tight accent-discussion">
      <div className="shell">
        <p className="breadcrumb"><Link href="/discussion">Discussion</Link> / Audio room</p>
        <div className="sidebar-layout">
          <div>
            <span className="tag">{room.topic}</span>
            <h1 className="mt-2">{room.title}</h1>
            <PlainText text={room.description} />
            <RoomPanel room={room} initialState={state} canJoin={Boolean(viewer?.emailVerified)} signedIn={Boolean(viewer)} audioConfigured={livekitConfigured()} />
            <h2 className="mt-3">Text channel</h2>
            <p className="muted small">Take part in writing here if you can&rsquo;t use audio, or if your connection is weak.</p>
            {thread.summary && <div className="notice"><p><strong>Host&rsquo;s summary</strong></p><PlainText text={thread.summary} /></div>}
            <ThreadView
              threadId={thread.id}
              initialStatus={thread.status}
              initialMessages={messages}
              initialHasEarlier={hasEarlier}
              canPost={Boolean(viewer?.emailVerified)}
              signedIn={Boolean(viewer)}
              viewerIsHost={thread.isHost}
              isModerator={isModerator}
              compact
            />
          </div>
          <aside className="stack">
            {(thread.isHost || isModerator) && <ThreadHostTools thread={thread} isModerator={isModerator} />}
            <div className="panel">
              <h2>How audio rooms work</h2>
              <ul className="small mb-0">
                <li>Everyone joins as a listener. Listening never asks for your microphone.</li>
                <li>Ask to speak; the host approves or declines.</li>
                <li>The host can mute or remove people, but can never turn your microphone on.</li>
                <li>Nothing is recorded.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
