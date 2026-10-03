// Live audio rooms. The database is the source of truth for who is in a room and in what role;
// LiveKit only carries the audio. Every role change is written here first and then pushed to
// LiveKit, so the service-side permission always matches what the room page shows.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, notify } from "@/lib/audit";
import { getLimits } from "@/lib/config";
import { can } from "@/lib/permissions";
import { createVoiceRoom, endVoiceRoom, livekitConfigured, mintVoiceToken, muteVoiceParticipant, removeVoiceParticipant, setVoicePublishPermission } from "@/lib/livekit";
import type { Viewer } from "@/lib/viewer";
import type { RoomState, RoomSummary } from "@/lib/discussions-shared";

// Someone counts as present while their page has checked in within this window.
const PRESENT_MS = 20_000;
const IDLE_ROOM_MS = 10 * 60 * 1000;

const roomInclude = { host: { select: { name: true } } } satisfies Prisma.AudioRoomInclude;
type RoomRow = Prisma.AudioRoomGetPayload<{ include: typeof roomInclude }>;

const presentWhere = (roomId: string) => ({ roomId, removedAt: null, leftAt: null, lastSeenAt: { gt: new Date(Date.now() - PRESENT_MS) } });

async function toSummary(row: RoomRow, viewerId?: string): Promise<RoomSummary> {
  const participantCount = row.status === "LIVE" ? await prisma.audioRoomMember.count({ where: presentWhere(row.id) }) : 0;
  return {
    id: row.id,
    threadId: row.threadId,
    title: row.title,
    description: row.description,
    topic: row.topic,
    status: row.status,
    startsAt: row.startsAt.toISOString(),
    timezone: row.timezone,
    hostId: row.hostId,
    hostName: row.host.name,
    isHost: row.hostId === viewerId,
    participantCount,
    maxParticipants: row.maxParticipants,
    maxSpeakers: row.maxSpeakers,
    endReason: row.endReason
  };
}

/** Live rooms first, then upcoming ones by start time. */
export async function listActiveRooms(limit = 12): Promise<RoomSummary[]> {
  try {
    const rows = await prisma.audioRoom.findMany({
      where: { status: { in: ["LIVE", "SCHEDULED"] }, thread: { status: { not: "ARCHIVED" } } },
      orderBy: [{ status: "asc" }, { startsAt: "asc" }],
      take: limit,
      include: roomInclude
    });
    const summaries = await Promise.all(rows.map((row) => toSummary(row)));
    return summaries.sort((a, b) => (a.status === b.status ? a.startsAt.localeCompare(b.startsAt) : a.status === "LIVE" ? -1 : 1));
  } catch (err) {
    console.error("listActiveRooms failed:", err);
    return [];
  }
}

export async function getRoom(id: string, viewerId?: string): Promise<RoomSummary | null> {
  const row = await prisma.audioRoom.findUnique({ where: { id }, include: roomInclude });
  return row ? toSummary(row, viewerId) : null;
}

export async function createRoom(viewer: Viewer, input: { title: string; description: string; topic: string; startsAt: Date; timezone: string }): Promise<string> {
  const limits = await getLimits();
  const room = await prisma.$transaction(async (tx) => {
    // Every room gets a text channel, so people on a poor connection can still take part.
    const thread = await tx.thread.create({ data: { hostId: viewer.id, title: input.title, topic: input.topic, body: input.description } });
    return tx.audioRoom.create({
      data: { hostId: viewer.id, threadId: thread.id, ...input, maxParticipants: limits.roomMaxParticipants, maxSpeakers: limits.roomMaxSpeakers }
    });
  });
  return room.id;
}

type Outcome = { ok: true } | { ok: false; error: string; status: number };
const fail = (error: string, status = 400): Outcome => ({ ok: false, error, status });

async function endRoom(roomId: string, reason: string, actorId: string | null): Promise<void> {
  const changed = await prisma.audioRoom.updateMany({ where: { id: roomId, status: "LIVE" }, data: { status: "ENDED", endedAt: new Date(), endReason: reason } });
  if (changed.count === 0) return;
  await audit(prisma, { actorId, action: "room.end", targetType: "AUDIO_ROOM", targetId: roomId, reason });
  await endVoiceRoom(roomId);
}

/** Host only: opens a scheduled room. The LiveKit room is created here, by the server. */
export async function startRoom(roomId: string, viewer: Viewer): Promise<Outcome> {
  const room = await prisma.audioRoom.findUnique({ where: { id: roomId } });
  if (!room) return fail("Room not found.", 404);
  if (room.hostId !== viewer.id) return fail("Only the host can start this room.", 403);
  if (room.status !== "SCHEDULED") return fail("This room has already started or ended.", 409);
  if (!livekitConfigured()) return fail("Live audio isn't set up on this site yet. The text channel still works.", 503);
  if (!(await createVoiceRoom(roomId, room.maxParticipants))) return fail("The audio service didn't respond. Please try again.", 502);

  const now = new Date();
  await prisma.$transaction([
    prisma.audioRoom.update({ where: { id: roomId }, data: { status: "LIVE", startedAt: now, hostLastSeenAt: now } }),
    prisma.audioRoomMember.upsert({ where: { roomId_userId: { roomId, userId: viewer.id } }, update: { role: "HOST", lastSeenAt: now, leftAt: null }, create: { roomId, userId: viewer.id, role: "HOST" } })
  ]);
  return { ok: true };
}

export async function cancelRoom(roomId: string, viewer: Viewer): Promise<Outcome> {
  const room = await prisma.audioRoom.findUnique({ where: { id: roomId }, select: { hostId: true, status: true } });
  if (!room) return fail("Room not found.", 404);
  if (room.hostId !== viewer.id && !can(viewer.roles, "moderation")) return fail("Only the host can cancel this room.", 403);
  const changed = await prisma.audioRoom.updateMany({ where: { id: roomId, status: "SCHEDULED" }, data: { status: "CANCELLED", endedAt: new Date(), endReason: "Cancelled by the host" } });
  return changed.count ? { ok: true } : fail("Only a scheduled room can be cancelled.", 409);
}

/**
 * Joining: checks the room is live, the member isn't removed or blocked and there is space,
 * then issues a short-lived token scoped to this room. The role comes from the database only,
 * so a crafted request can't ask for host or speaker rights.
 */
export async function joinRoom(roomId: string, viewer: Viewer): Promise<{ ok: true; token: string; url: string; role: string } | { ok: false; error: string; status: number }> {
  const room = await prisma.audioRoom.findUnique({ where: { id: roomId } });
  if (!room) return { ok: false, error: "Room not found.", status: 404 };
  if (room.status !== "LIVE") return { ok: false, error: room.status === "SCHEDULED" ? "This room hasn't started yet." : "This room has ended.", status: 409 };

  const existing = await prisma.audioRoomMember.findUnique({ where: { roomId_userId: { roomId, userId: viewer.id } } });
  if (existing?.removedAt) return { ok: false, error: "The host removed you from this room.", status: 403 };
  if (await prisma.userBlock.findFirst({ where: { blockerId: room.hostId, blockedId: viewer.id }, select: { id: true } })) {
    return { ok: false, error: "The host has blocked you from their rooms.", status: 403 };
  }

  const isHost = room.hostId === viewer.id;
  const alreadyPresent = existing && !existing.leftAt && existing.lastSeenAt.getTime() > Date.now() - PRESENT_MS;
  if (!isHost && !alreadyPresent) {
    const present = await prisma.audioRoomMember.count({ where: presentWhere(roomId) });
    if (present >= room.maxParticipants) return { ok: false, error: `This room is full (${room.maxParticipants} people). You can still follow and take part in the text channel.`, status: 409 };
  }

  const now = new Date();
  // Rejoining keeps a speaker a speaker; everyone else starts as a listener.
  const role = isHost ? "HOST" : existing?.role === "SPEAKER" ? "SPEAKER" : "LISTENER";
  await prisma.audioRoomMember.upsert({
    where: { roomId_userId: { roomId, userId: viewer.id } },
    update: { role, lastSeenAt: now, leftAt: null },
    create: { roomId, userId: viewer.id, role }
  });
  if (isHost) await prisma.audioRoom.update({ where: { id: roomId }, data: { hostLastSeenAt: now } });

  // The account id is the LiveKit identity, so reconnecting replaces the old connection instead of duplicating the person.
  const minted = await mintVoiceToken(roomId, viewer.id, viewer.name, role !== "LISTENER");
  if (!minted) return { ok: false, error: "Live audio isn't set up on this site yet.", status: 503 };
  return { ok: true, ...minted, role };
}

/**
 * The room as this viewer should see it. When `checkIn` is set the viewer is in the room: their
 * presence and time are recorded. Also where an abandoned room is closed.
 */
export async function roomState(roomId: string, viewer: Viewer | null, checkIn: boolean): Promise<RoomState | null> {
  let room = await prisma.audioRoom.findUnique({ where: { id: roomId } });
  if (!room) return null;
  const limits = await getLimits();
  const now = Date.now();

  if (room.status === "LIVE" && viewer && checkIn) {
    const member = await prisma.audioRoomMember.findUnique({ where: { roomId_userId: { roomId, userId: viewer.id } } });
    if (member && !member.removedAt && !member.leftAt) {
      // Participation time is kept for cost tracking (participant-minutes). No audio is stored.
      const elapsed = Math.min(15, Math.max(0, Math.round((now - member.lastSeenAt.getTime()) / 1000)));
      await prisma.audioRoomMember.update({ where: { id: member.id }, data: { lastSeenAt: new Date(now), secondsInRoom: { increment: elapsed } } });
      if (room.hostId === viewer.id) {
        await prisma.audioRoom.update({ where: { id: roomId }, data: { hostLastSeenAt: new Date(now) } });
        room = { ...room, hostLastSeenAt: new Date(now) };
        // A removed member's token could still be valid for up to a minute: keep them out until it expires.
        const justRemoved = await prisma.audioRoomMember.findMany({ where: { roomId, removedAt: { gt: new Date(now - 2 * 60 * 1000) } }, select: { userId: true } });
        await Promise.all(justRemoved.map((m) => removeVoiceParticipant(roomId, m.userId)));
      }
    }
  }

  let hostAwaySecondsLeft: number | null = null;
  if (room.status === "LIVE") {
    const hostSeen = (room.hostLastSeenAt ?? room.startedAt ?? room.createdAt).getTime();
    if (now - hostSeen > PRESENT_MS) {
      hostAwaySecondsLeft = Math.max(0, Math.round(limits.hostGraceSeconds - (now - hostSeen) / 1000));
      if (hostAwaySecondsLeft === 0) {
        await endRoom(roomId, "The host left and did not return", null);
        room = { ...room, status: "ENDED", endReason: "The host left and did not return" };
        hostAwaySecondsLeft = null;
      }
    }
  }

  const members = room.status === "LIVE"
    ? await prisma.audioRoomMember.findMany({ where: presentWhere(roomId), orderBy: [{ role: "asc" }, { joinedAt: "asc" }], include: { user: { select: { name: true } } } })
    : [];
  const mine = viewer ? await prisma.audioRoomMember.findUnique({ where: { roomId_userId: { roomId, userId: viewer.id } } }) : null;

  return {
    status: room.status,
    endReason: room.endReason,
    people: members.map((m) => ({ userId: m.userId, name: m.user.name, role: m.role, requestedToSpeak: m.speakRequest === "REQUESTED", isYou: m.userId === viewer?.id })),
    you: mine ? { role: mine.role, speakRequest: mine.speakRequest, removed: Boolean(mine.removedAt) } : null,
    hostAwaySecondsLeft,
    canManage: Boolean(viewer && (room.hostId === viewer.id || can(viewer.roles, "moderation")))
  };
}

export type RoomAction = "request" | "cancel-request" | "leave" | "approve" | "decline" | "demote" | "mute" | "remove" | "end";

/** Everything a member or host can do inside a live room. Each change is applied to LiveKit immediately. */
export async function roomAction(roomId: string, viewer: Viewer, action: RoomAction, targetUserId?: string): Promise<Outcome> {
  const room = await prisma.audioRoom.findUnique({ where: { id: roomId } });
  if (!room) return fail("Room not found.", 404);
  if (room.status !== "LIVE") return fail("This room isn't live.", 409);

  // Things a member does for themselves.
  if (action === "request" || action === "cancel-request" || action === "leave") {
    const mine = await prisma.audioRoomMember.findUnique({ where: { roomId_userId: { roomId, userId: viewer.id } } });
    if (!mine || mine.removedAt) return fail("You're not in this room.", 403);
    if (action === "leave") {
      await prisma.audioRoomMember.update({ where: { id: mine.id }, data: { leftAt: new Date(), speakRequest: "NONE", ...(mine.role === "SPEAKER" ? { role: "LISTENER" as const } : {}) } });
      return { ok: true };
    }
    if (mine.role !== "LISTENER") return fail("You can already speak.", 409);
    await prisma.audioRoomMember.update({ where: { id: mine.id }, data: { speakRequest: action === "request" ? "REQUESTED" : "NONE" } });
    return { ok: true };
  }

  // Everything else is host control. A host controls only their own room; moderators can step in anywhere.
  const moderator = can(viewer.roles, "moderation");
  if (room.hostId !== viewer.id && !moderator) return fail("Only the host can do that.", 403);

  if (action === "end") {
    await endRoom(roomId, room.hostId === viewer.id ? "Ended by the host" : "Ended by a moderator", viewer.id);
    return { ok: true };
  }

  if (!targetUserId || targetUserId === room.hostId) return fail("Choose a participant.", 400);
  const target = await prisma.audioRoomMember.findUnique({ where: { roomId_userId: { roomId, userId: targetUserId } } });
  if (!target || target.removedAt) return fail("That person isn't in the room.", 404);

  if (action === "approve") {
    // Count and promote in one serializable transaction, so two approvals can't both take the last seat.
    const promoted = await prisma
      .$transaction(
        async (tx) => {
          const speakers = await tx.audioRoomMember.count({ where: { ...presentWhere(roomId), role: { in: ["HOST", "SPEAKER"] } } });
          if (speakers >= room.maxSpeakers) return false;
          await tx.audioRoomMember.update({ where: { id: target.id }, data: { role: "SPEAKER", speakRequest: "NONE" } });
          return true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
      .catch(() => false);
    if (!promoted) return fail(`There are already ${room.maxSpeakers} speakers. Move someone back to listening first.`, 409);
    if (!(await setVoicePublishPermission(roomId, targetUserId, true))) {
      // The service didn't accept the change, so undo ours: the page must never show a right that isn't real.
      await prisma.audioRoomMember.update({ where: { id: target.id }, data: { role: "LISTENER" } });
      return fail("The audio service didn't accept the change. Please try again.", 502);
    }
    await notify({ userId: targetUserId, type: "audio", title: "You can now speak in the room", body: "The host approved your request. Turn on your microphone when you're ready.", href: `/discussion/rooms/${roomId}` });
    return { ok: true };
  }
  if (action === "decline") {
    await prisma.audioRoomMember.update({ where: { id: target.id }, data: { speakRequest: "DECLINED" } });
    return { ok: true };
  }
  if (action === "demote") {
    await prisma.audioRoomMember.update({ where: { id: target.id }, data: { role: "LISTENER", speakRequest: "NONE" } });
    await setVoicePublishPermission(roomId, targetUserId, false);
    return { ok: true };
  }
  if (action === "mute") {
    return (await muteVoiceParticipant(roomId, targetUserId)) ? { ok: true } : fail("Could not mute that person.", 502);
  }
  if (action === "remove") {
    await prisma.$transaction(async (tx) => {
      await tx.audioRoomMember.update({ where: { id: target.id }, data: { removedAt: new Date(), role: "LISTENER", speakRequest: "NONE" } });
      await audit(tx, { actorId: viewer.id, action: "room.remove-member", targetType: "AUDIO_ROOM", targetId: roomId, reason: "Removed by host", metadata: { userId: targetUserId } });
    });
    await setVoicePublishPermission(roomId, targetUserId, false);
    await removeVoiceParticipant(roomId, targetUserId);
    return { ok: true };
  }
  return fail("Unknown action.", 400);
}

/** Closes rooms whose host never came back or that have sat empty. Run by the jobs endpoint. */
export async function reconcileRooms(): Promise<number> {
  const limits = await getLimits();
  const live = await prisma.audioRoom.findMany({ where: { status: "LIVE" }, select: { id: true, hostLastSeenAt: true, startedAt: true, createdAt: true } });
  let ended = 0;
  for (const room of live) {
    const hostSeen = (room.hostLastSeenAt ?? room.startedAt ?? room.createdAt).getTime();
    const lastAnyone = await prisma.audioRoomMember.findFirst({ where: { roomId: room.id }, orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } });
    const idle = !lastAnyone || Date.now() - lastAnyone.lastSeenAt.getTime() > IDLE_ROOM_MS;
    if (Date.now() - hostSeen > (limits.hostGraceSeconds + 20) * 1000) { await endRoom(room.id, "The host left and did not return", null); ended += 1; }
    else if (idle) { await endRoom(room.id, "Closed after sitting idle", null); ended += 1; }
  }
  return ended;
}

/** Participant-minutes per room, for cost tracking at /admin/discussion. */
export async function roomUsage(roomId: string): Promise<number> {
  const total = await prisma.audioRoomMember.aggregate({ where: { roomId }, _sum: { secondsInRoom: true } });
  return Math.round((total._sum.secondsInRoom ?? 0) / 60);
}
