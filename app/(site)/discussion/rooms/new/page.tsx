import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field } from "@/components/ActionForm";
import { RoomScheduleFields } from "@/components/RoomScheduleFields";
import { VerifyNotice } from "@/components/VerifyNotice";
import { createRoomAction } from "@/lib/actions/discussion";
import { getLimits } from "@/lib/config";
import { TEXT_LIMITS, TOPICS } from "@/lib/constants";
import { livekitConfigured } from "@/lib/livekit";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Host an audio room", robots: { index: false } };

export default async function NewRoomPage() {
  const viewer = await requireViewer("/discussion/rooms/new");
  const limits = await getLimits();
  return (
    <section className="page-section accent-discussion">
      <div className="shell narrow">
        <p className="breadcrumb"><Link href="/discussion">Discussion</Link> / New audio room</p>
        <h1>Host an audio room</h1>
        <p className="lede">People join as listeners and ask to speak; you decide who speaks. Each room holds up to {limits.roomMaxParticipants} people with {limits.roomMaxSpeakers} speakers at a time, and has a text channel for anyone on a weak connection.</p>
        {!livekitConfigured() && <div className="notice warn"><p>Live audio isn&rsquo;t set up on this site yet. You can schedule a room and use its text channel, but it can&rsquo;t be started until audio is configured.</p></div>}
        {!viewer.emailVerified ? <VerifyNotice what="host a room" /> : (
          <div className="panel">
            <ActionForm action={createRoomAction} submitLabel="Schedule room" pendingLabel="Scheduling…">
              <Field name="title" label="Title" required maxLength={TEXT_LIMITS.title} />
              <Field name="topic" label="Topic" type="select" options={TOPICS} required />
              <Field name="description" label="What is the room about?" type="textarea" rows={4} required maxLength={2000} />
              <RoomScheduleFields />
            </ActionForm>
          </div>
        )}
        <p className="muted small mt-2">Rooms are not recorded. If you leave, the room closes after {Math.round(limits.hostGraceSeconds / 60)} minutes unless you return.</p>
      </div>
    </section>
  );
}
