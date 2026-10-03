"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { ROOM_POLL_MS } from "@/lib/constants";
import type { RoomState, RoomSummary } from "@/lib/discussions-shared";
import { LocalTime } from "@/components/LocalTime";
import { ReportButton } from "@/components/ReportButton";

type Connection = "idle" | "connecting" | "connected" | "reconnecting" | "lost";

export function RoomPanel({ room, initialState, canJoin, signedIn, audioConfigured }: { room: RoomSummary; initialState: RoomState; canJoin: boolean; signedIn: boolean; audioConfigured: boolean }) {
  const router = useRouter();
  const roomRef = useRef<Room | null>(null);
  const audioHostRef = useRef<HTMLDivElement>(null);
  const leavingRef = useRef(false);
  const [state, setState] = useState(initialState);
  const [connection, setConnection] = useState<Connection>("idle");
  const [micOn, setMicOn] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const inRoom = connection === "connected" || connection === "reconnecting";
  const myRole = state.you?.role ?? "LISTENER";
  const canSpeak = myRole === "HOST" || myRole === "SPEAKER";

  const disconnect = useCallback(() => {
    leavingRef.current = true;
    roomRef.current?.disconnect();
    roomRef.current = null;
    setConnection("idle");
    setMicOn(false);
    setSpeaking(new Set());
  }, []);

  useEffect(() => () => { leavingRef.current = true; roomRef.current?.disconnect(); }, []);

  // The server is the source of truth for who is here and in what role. While in the room this
  // also acts as the presence check-in.
  useEffect(() => {
    if (state.status === "ENDED" || state.status === "CANCELLED") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/rooms/${room.id}/state`, { method: inRoom ? "POST" : "GET" });
        if (res.ok) setState(await res.json());
      } catch {
        // Try again on the next tick.
      }
    }, ROOM_POLL_MS);
    return () => clearInterval(timer);
  }, [room.id, inRoom, state.status]);

  // The room ended, or the host removed us: drop the audio connection.
  useEffect(() => {
    if (inRoom && (state.status !== "LIVE" || state.you?.removed)) disconnect();
  }, [state.status, state.you?.removed, inRoom, disconnect]);

  // Moved back to listening: the microphone goes off straight away.
  useEffect(() => {
    if (!canSpeak && micOn) {
      void roomRef.current?.localParticipant.setMicrophoneEnabled(false);
      setMicOn(false);
    }
  }, [canSpeak, micOn]);

  async function act(action: string, userId?: string) {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${room.id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, userId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "That didn't work. Please try again."); return false; }
      const fresh = await fetch(`/api/rooms/${room.id}/state`, { method: inRoom ? "POST" : "GET" });
      if (fresh.ok) setState(await fresh.json());
      if (action === "start" || action === "cancel") router.refresh();
      return true;
    } catch {
      setError("Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setError("");
    setConnection("connecting");
    leavingRef.current = false;
    try {
      const res = await fetch(`/api/rooms/${room.id}/join`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not join the room."); setConnection("idle"); return; }

      const lk = new Room();
      roomRef.current = lk;
      lk.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        audioHostRef.current?.appendChild(track.attach());
      });
      lk.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => { track.detach().forEach((el) => el.remove()); });
      lk.on(RoomEvent.ActiveSpeakersChanged, (speakers) => setSpeaking(new Set(speakers.map((p) => p.identity))));
      lk.on(RoomEvent.Reconnecting, () => setConnection("reconnecting"));
      lk.on(RoomEvent.Reconnected, () => setConnection("connected"));
      lk.on(RoomEvent.LocalTrackUnpublished, () => setMicOn(false));
      lk.on(RoomEvent.TrackMuted, (_pub, participant) => { if (participant.identity === lk.localParticipant.identity) setMicOn(false); });
      lk.on(RoomEvent.Disconnected, () => {
        setMicOn(false);
        setSpeaking(new Set());
        setConnection(leavingRef.current ? "idle" : "lost");
      });

      // Joining only listens: the microphone is not requested here, whatever the role.
      await lk.connect(data.url, data.token);
      setConnection("connected");
      const fresh = await fetch(`/api/rooms/${room.id}/state`, { method: "POST" });
      if (fresh.ok) setState(await fresh.json());
    } catch {
      setError("Could not connect to the audio. Check your connection and try again. You can still use the text channel below.");
      setConnection("idle");
    }
  }

  async function leave() {
    disconnect();
    await act("leave");
  }

  async function toggleMic() {
    const lk = roomRef.current;
    if (!lk || !canSpeak) return;
    setError("");
    try {
      // The browser's microphone prompt appears only now, when a speaker chooses to turn it on.
      await lk.localParticipant.setMicrophoneEnabled(!micOn);
      setMicOn(!micOn);
      if (!micOn) setDevices(await Room.getLocalDevices("audioinput"));
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      setError(
        name === "NotAllowedError" ? "Microphone access was blocked. Allow it in your browser's site settings, then try again. You can keep listening and use the text channel."
        : name === "NotFoundError" ? "No microphone was found on this device. You can keep listening and use the text channel."
        : "The microphone couldn't be turned on. You can keep listening and use the text channel."
      );
    }
  }

  const live = state.status === "LIVE";
  const requests = state.people.filter((p) => p.requestedToSpeak);

  return (
    <div className="room-panel" aria-label="Audio room">
      <div ref={audioHostRef} style={{ display: "none" }} />
      <div className="row spread">
        <div className="row">
          {live ? <span className="tag live">Live</span> : <span className="tag neutral">{state.status === "SCHEDULED" ? "Scheduled" : state.status === "ENDED" ? "Ended" : "Cancelled"}</span>}
          <span className="muted small">Hosted by {room.hostName}</span>
          {live && <span className="muted small">{state.people.length} of {room.maxParticipants} people · up to {room.maxSpeakers} speakers</span>}
        </div>
        {signedIn && !room.isHost && <ReportButton targetType="AUDIO_ROOM" targetId={room.id} label="Report room" />}
      </div>

      {state.status === "SCHEDULED" && (
        <div className="mt-2">
          <p>Starts <LocalTime iso={room.startsAt} /></p>
          {room.isHost ? (
            <div className="button-row">
              <button type="button" className="button on-dark" disabled={busy || !audioConfigured} onClick={() => act("start")}>Start the room now</button>
              <button type="button" className="button on-dark-outline" disabled={busy} onClick={() => { if (window.confirm("Cancel this room?")) void act("cancel"); }}>Cancel room</button>
            </div>
          ) : (
            <p className="muted small mb-0">The host will open the room at the start time. You can use the text channel below in the meantime.</p>
          )}
          {!audioConfigured && <p className="muted small mt-2 mb-0">Live audio isn&rsquo;t set up on this site yet, so rooms can&rsquo;t be started. The text channel works.</p>}
        </div>
      )}

      {(state.status === "ENDED" || state.status === "CANCELLED") && (
        <p className="mt-2 mb-0">{state.endReason || "This room has ended."} The text channel below stays available to read.</p>
      )}

      {live && (
        <div className="mt-2">
          {state.hostAwaySecondsLeft !== null && (
            <p className="status" role="status" style={{ color: "#17211D" }}>The host has disconnected. The room will close in {state.hostAwaySecondsLeft} seconds unless they return.</p>
          )}

          {state.you?.removed ? (
            <p className="mb-0">The host removed you from this room.</p>
          ) : !inRoom ? (
            <div>
              {connection === "lost" && <p role="status">The audio connection was lost.</p>}
              {canJoin ? (
                <button type="button" className="button on-dark" disabled={connection === "connecting"} onClick={join}>
                  {connection === "connecting" ? "Joining…" : connection === "lost" ? "Rejoin" : room.isHost ? "Join your room" : "Join and listen"}
                </button>
              ) : (
                <p className="mb-0">{signedIn ? "Confirm your email address to join the audio." : <><Link href={`/login?callbackUrl=/discussion/rooms/${room.id}`} style={{ color: "#fff" }}>Sign in</Link> to listen or ask to speak.</>}</p>
              )}
              <p className="muted small mt-2 mb-0">Joining only listens. Your microphone is never requested unless you become a speaker and choose to turn it on.</p>
            </div>
          ) : (
            <div className="stack">
              <div className="row">
                <span className={`mic-state${micOn ? " on" : ""}`} role="status">
                  {connection === "reconnecting" ? "Reconnecting…" : !canSpeak ? "Listening" : micOn ? "Microphone on" : "Microphone off"}
                </span>
                {canSpeak && <button type="button" className="button small on-dark" onClick={toggleMic} aria-pressed={micOn}>{micOn ? "Mute" : "Turn on microphone"}</button>}
                {!canSpeak && state.you?.speakRequest !== "REQUESTED" && (
                  <button type="button" className="button small on-dark" disabled={busy} onClick={() => act("request")}>Ask to speak</button>
                )}
                {!canSpeak && state.you?.speakRequest === "REQUESTED" && (
                  <button type="button" className="button small on-dark-outline" disabled={busy} onClick={() => act("cancel-request")}>Waiting for the host · cancel request</button>
                )}
                <button type="button" className="button small on-dark-outline" onClick={leave}>Leave</button>
                {state.canManage && <button type="button" className="button small on-dark-outline" disabled={busy} onClick={() => { if (window.confirm("End the room for everyone?")) void act("end"); }}>End room</button>}
              </div>
              {!canSpeak && state.you?.speakRequest === "DECLINED" && <p className="muted small mb-0">The host declined your last request to speak. You can ask again.</p>}
              {canSpeak && devices.length > 1 && (
                <div>
                  <label htmlFor="mic-device" className="small">Microphone </label>
                  <select id="mic-device" className="room-select" onChange={(e) => void roomRef.current?.switchActiveDevice("audioinput", e.target.value)}>
                    {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || "Microphone"}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {state.canManage && requests.length > 0 && (
            <div className="mt-2">
              <h3>Requests to speak</h3>
              <ul className="room-people">
                {requests.map((person) => (
                  <li key={person.userId} className="room-person">
                    {person.name}
                    <span className="room-person-actions">
                      <button type="button" disabled={busy} onClick={() => act("approve", person.userId)}>Approve</button>
                      <button type="button" disabled={busy} onClick={() => act("decline", person.userId)}>Decline</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h3 className="mt-2">In the room</h3>
          {state.people.length === 0 ? <p className="muted small mb-0">Nobody has joined yet.</p> : (
            <ul className="room-people">
              {state.people.map((person) => (
                <li key={person.userId} className={`room-person${speaking.has(person.userId) ? " speaking" : ""}`}>
                  <span>{person.name}{person.isYou ? " (you)" : ""}</span>
                  <span className="muted small">{person.role === "HOST" ? "Host" : person.role === "SPEAKER" ? "Speaker" : "Listener"}{speaking.has(person.userId) ? " · speaking" : ""}</span>
                  {state.canManage && person.role !== "HOST" && !person.isYou && (
                    <span className="room-person-actions">
                      {person.role === "SPEAKER" && <button type="button" disabled={busy} onClick={() => act("mute", person.userId)}>Mute</button>}
                      {person.role === "SPEAKER" && <button type="button" disabled={busy} onClick={() => act("demote", person.userId)}>Make listener</button>}
                      <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Remove ${person.name} from the room? They won't be able to rejoin.`)) void act("remove", person.userId); }}>Remove</button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="status error mt-2" role="alert">{error}</p>}
      <p className="muted small mt-2 mb-0">Audio rooms are not recorded. We keep only who joined and for how long.</p>
    </div>
  );
}
