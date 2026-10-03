// Dependency-free, so it is safe to import from both server code and browser components.

export type ThreadStatusKind = "OPEN" | "LOCKED" | "ARCHIVED";
export type RoomStatusKind = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";

export type ThreadSummary = {
  id: string;
  title: string;
  topic: string;
  body: string;
  status: ThreadStatusKind;
  hostId: string;
  hostName: string;
  isHost: boolean;
  messageCount: number;
  createdAt: string;
  lastActivityAt: string;
  room: { id: string; status: RoomStatusKind; startsAt: string } | null;
};

export type ThreadDetail = ThreadSummary & { referenceUrl: string | null; summary: string | null };

export type ThreadMessageView = {
  id: string;
  body: string;
  removed: boolean;
  hiddenByBlock: boolean;
  createdAt: string;
  edited: boolean;
  authorId: string;
  authorName: string;
  isOwn: boolean;
  isHost: boolean;
  replyTo: { authorName: string; excerpt: string } | null;
};

export type RoomSummary = {
  id: string;
  threadId: string;
  title: string;
  description: string;
  topic: string;
  status: RoomStatusKind;
  startsAt: string;
  timezone: string;
  hostId: string;
  hostName: string;
  isHost: boolean;
  participantCount: number;
  maxParticipants: number;
  maxSpeakers: number;
  endReason: string | null;
};

export type RoomPerson = {
  userId: string;
  name: string;
  role: "HOST" | "SPEAKER" | "LISTENER";
  requestedToSpeak: boolean;
  isYou: boolean;
};

export type RoomState = {
  status: RoomStatusKind;
  endReason: string | null;
  people: RoomPerson[];
  you: { role: "HOST" | "SPEAKER" | "LISTENER"; speakRequest: "NONE" | "REQUESTED" | "DECLINED"; removed: boolean } | null;
  /** Seconds until the room closes because its host has gone; null while the host is present. */
  hostAwaySecondsLeft: number | null;
  canManage: boolean;
};

export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
