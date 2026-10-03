// Server-only: creates LiveKit rooms, mints access tokens and changes participant permissions for
// Discussion's live audio. The browser never holds the API secret and never decides its own role:
// every token and permission change comes from here after lib/rooms.ts has checked the database.
import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";

const URL = process.env.LIVEKIT_URL;
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;

export function livekitConfigured(): boolean {
  return Boolean(URL && API_KEY && API_SECRET);
}

// Namespaced so NBM rooms can never collide with another app on the same LiveKit project.
export const voiceRoomName = (roomId: string) => `nbm-room-${roomId}`;

let roomService: RoomServiceClient | null = null;
function service(): RoomServiceClient {
  if (!roomService) roomService = new RoomServiceClient(URL!.replace(/^wss:/, "https:").replace(/^ws:/, "http:"), API_KEY!, API_SECRET!);
  return roomService;
}

export async function createVoiceRoom(roomId: string, maxParticipants: number): Promise<boolean> {
  if (!livekitConfigured()) return false;
  try {
    // emptyTimeout closes the media room by itself if everyone has gone for five minutes.
    await service().createRoom({ name: voiceRoomName(roomId), maxParticipants, emptyTimeout: 300 });
    return true;
  } catch (err) {
    console.error("createVoiceRoom failed:", err);
    return false;
  }
}

/**
 * A room-scoped token for one member. It is valid for one minute, long enough to connect but
 * too short to be kept and reused later. Listeners get a token that cannot publish audio at
 * all, so a modified client still can't speak; only audio (microphone) is ever publishable.
 */
export async function mintVoiceToken(roomId: string, identity: string, name: string, canPublish: boolean): Promise<{ token: string; url: string } | null> {
  if (!livekitConfigured()) return null;
  const at = new AccessToken(API_KEY!, API_SECRET!, { identity, name, ttl: 60 });
  at.addGrant({
    room: voiceRoomName(roomId),
    roomJoin: true,
    canSubscribe: true,
    canPublish,
    canPublishData: false,
    canPublishSources: [TrackSource.MICROPHONE]
  });
  return { token: await at.toJwt(), url: URL! };
}

/** Grants or revokes a participant's ability to speak. LiveKit pushes this to their open connection. */
export async function setVoicePublishPermission(roomId: string, identity: string, canPublish: boolean): Promise<boolean> {
  if (!livekitConfigured()) return false;
  try {
    await service().updateParticipant(voiceRoomName(roomId), identity, undefined, {
      canPublish,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: [TrackSource.MICROPHONE]
    });
    return true;
  } catch (err) {
    console.error("setVoicePublishPermission failed:", err);
    return false;
  }
}

/** Mutes whatever the participant is publishing. There is deliberately no way to unmute someone remotely. */
export async function muteVoiceParticipant(roomId: string, identity: string): Promise<boolean> {
  if (!livekitConfigured()) return false;
  try {
    const participant = await service().getParticipant(voiceRoomName(roomId), identity);
    for (const track of participant.tracks) {
      if (!track.muted) await service().mutePublishedTrack(voiceRoomName(roomId), identity, track.sid, true);
    }
    return true;
  } catch (err) {
    console.error("muteVoiceParticipant failed:", err);
    return false;
  }
}

export async function removeVoiceParticipant(roomId: string, identity: string): Promise<void> {
  if (!livekitConfigured()) return;
  try {
    await service().removeParticipant(voiceRoomName(roomId), identity);
  } catch {
    // Not connected (anymore): nothing to remove.
  }
}

/** Disconnects everyone and tears down the media room. */
export async function endVoiceRoom(roomId: string): Promise<void> {
  if (!livekitConfigured()) return;
  try {
    await service().deleteRoom(voiceRoomName(roomId));
  } catch {
    // Deleting a room nobody joined throws: that's fine, not an error.
  }
}
