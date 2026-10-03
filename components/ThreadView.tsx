"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { TEXT_LIMITS, THREAD_POLL_MS } from "@/lib/constants";
import { formatMessageTime, type ThreadMessageView, type ThreadStatusKind } from "@/lib/discussions-shared";
import { ReportButton } from "@/components/ReportButton";

function mergeById(current: ThreadMessageView[], incoming: ThreadMessageView[]): ThreadMessageView[] {
  // A message can arrive twice (from our own send and from the next poll); keep one copy.
  const seen = new Set(current.map((m) => m.id));
  return [...current, ...incoming.filter((m) => !seen.has(m.id))];
}

export function ThreadView({
  threadId,
  initialStatus,
  initialMessages,
  initialHasEarlier,
  canPost,
  signedIn,
  viewerIsHost,
  isModerator,
  compact = false
}: {
  threadId: string;
  initialStatus: ThreadStatusKind;
  initialMessages: ThreadMessageView[];
  initialHasEarlier: boolean;
  canPost: boolean;
  signedIn: boolean;
  viewerIsHost: boolean;
  isModerator: boolean;
  compact?: boolean;
}) {
  const draftKey = `nbm-draft-${threadId}`;
  const [status, setStatus] = useState(initialStatus);
  const [messages, setMessages] = useState(initialMessages);
  const [hasEarlier, setHasEarlier] = useState(initialHasEarlier);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ThreadMessageView | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const lastIdRef = useRef<string | undefined>(initialMessages[initialMessages.length - 1]?.id);
  // One id per message being written. A retry reuses it, so the server can't store the message twice.
  const clientIdRef = useRef<string>("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // An unsent draft survives a dropped connection, a reload or a closed tab.
  useEffect(() => {
    try { const stored = localStorage.getItem(draftKey); if (stored) setDraft(stored); } catch { /* storage unavailable */ }
  }, [draftKey]);
  useEffect(() => {
    try { if (draft) localStorage.setItem(draftKey, draft); else localStorage.removeItem(draftKey); } catch { /* storage unavailable */ }
  }, [draft, draftKey]);

  useEffect(() => {
    if (status === "ARCHIVED") return;
    const timer = setInterval(async () => {
      // Skip while the tab is hidden: nobody is reading, and it saves data.
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/threads/${threadId}/messages?after=${lastIdRef.current ?? ""}`);
        if (!res.ok) { setOffline(res.status >= 500); return; }
        const data = await res.json();
        setOffline(false);
        setStatus(data.status);
        if (data.messages?.length) {
          lastIdRef.current = data.messages[data.messages.length - 1].id;
          setMessages((list) => mergeById(list, data.messages));
        }
      } catch {
        // A missed poll just tries again next tick; the page recovers by itself when the connection returns.
        setOffline(true);
      }
    }, THREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [threadId, status]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const body = draft.trim();
    if (!body || sending) return;
    if (!clientIdRef.current) clientIdRef.current = crypto.randomUUID();
    setSending(true);
    try {
      const res = await fetch(`/api/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, clientId: clientIdRef.current, parentId: replyTo?.id ?? null })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send your message.");
        if (res.status === 409) setStatus("LOCKED");
        return;
      }
      setMessages((list) => mergeById(list, [data.message]));
      clientIdRef.current = "";
      setDraft("");
      setReplyTo(null);
    } catch {
      setError("Not sent: the connection dropped. Your message is still in the box; press Send to try again.");
    } finally {
      setSending(false);
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const res = await fetch(`/api/threads/${threadId}/messages/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: editing.body }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || "Could not save your edit."); return; }
    setMessages((list) => list.map((m) => (m.id === editing.id ? data.message : m)));
    setEditing(null);
  }

  async function remove(message: ThreadMessageView) {
    if (!window.confirm(message.isOwn ? "Remove your message?" : "Remove this message from the discussion? The action is recorded.")) return;
    const res = await fetch(`/api/threads/${threadId}/messages/${message.id}`, { method: "DELETE" });
    if (res.ok) setMessages((list) => list.map((m) => (m.id === message.id ? { ...m, removed: true, body: "" } : m)));
    else setError("Could not remove that message.");
  }

  async function loadEarlier() {
    const first = messages[0];
    if (!first) return;
    setLoadingEarlier(true);
    try {
      const res = await fetch(`/api/threads/${threadId}/messages?before=${first.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages((list) => [...data.messages.filter((m: ThreadMessageView) => !list.some((x) => x.id === m.id)), ...list]);
        setHasEarlier(data.hasEarlier);
      }
    } finally {
      setLoadingEarlier(false);
    }
  }

  const canRemove = (message: ThreadMessageView) => message.isOwn || viewerIsHost || isModerator;

  return (
    <section aria-label="Messages">
      {hasEarlier && (
        <p><button type="button" className="button small ghost" onClick={loadEarlier} disabled={loadingEarlier}>{loadingEarlier ? "Loading…" : "Load earlier messages"}</button></p>
      )}

      <div className="message-list" aria-live="polite">
        {messages.length === 0 && <p className="status">No replies yet. {status === "OPEN" ? "Share a question, a finding or a lesson learned." : ""}</p>}
        {messages.map((message) => (
          <article key={message.id} id={`m-${message.id}`} className={`message${message.isOwn ? " own" : ""}${message.replyTo ? " reply" : ""}${message.removed || message.hiddenByBlock ? " removed" : ""}`}>
            {message.removed ? (
              <p className="mb-0">This message was removed.</p>
            ) : message.hiddenByBlock ? (
              <p className="mb-0">A message from someone you blocked.</p>
            ) : editing?.id === message.id ? (
              <form className="stack" onSubmit={saveEdit}>
                <label className="sr-only" htmlFor={`edit-${message.id}`}>Edit your message</label>
                <textarea id={`edit-${message.id}`} className="field" rows={3} maxLength={TEXT_LIMITS.message} value={editing.body} onChange={(e) => setEditing({ id: message.id, body: e.target.value })} />
                <div className="row">
                  <button className="button small" type="submit" disabled={!editing.body.trim()}>Save</button>
                  <button className="button small ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                {message.replyTo && <p className="message-quote">Replying to {message.replyTo.authorName}: {message.replyTo.excerpt}</p>}
                <p className="comment-meta">
                  <strong>{message.authorName}</strong>
                  {message.isHost && <span className="tag">Host</span>}
                  <span>{formatMessageTime(message.createdAt)}{message.edited ? " · edited" : ""}</span>
                </p>
                <p className="comment-body">{message.body}</p>
                {signedIn && (
                  <p className="comment-meta mt-2 mb-0">
                    {canPost && status === "OPEN" && <button type="button" className="text-button small" onClick={() => { setReplyTo(message); inputRef.current?.focus(); }}>Reply</button>}
                    {message.isOwn && status === "OPEN" && <button type="button" className="text-button small" onClick={() => setEditing({ id: message.id, body: message.body })}>Edit</button>}
                    {canRemove(message) && <button type="button" className="text-button danger small" onClick={() => remove(message)}>Remove</button>}
                    {!message.isOwn && <ReportButton targetType="THREAD_MESSAGE" targetId={message.id} compact />}
                  </p>
                )}
              </>
            )}
          </article>
        ))}
      </div>

      {offline && <p className="status" role="status">Connection lost. Trying again… anything you&rsquo;ve typed is kept.</p>}

      {status === "OPEN" ? (
        canPost ? (
          <form className="compose" onSubmit={send}>
            {replyTo && (
              <p className="muted small mb-0">Replying to {replyTo.authorName}. <button type="button" className="text-button small" onClick={() => setReplyTo(null)}>Cancel reply</button></p>
            )}
            <div className="compose-row">
              <label className="sr-only" htmlFor={`compose-${threadId}`}>Write a message</label>
              <textarea
                id={`compose-${threadId}`}
                ref={inputRef}
                className="field"
                rows={compact ? 2 : 3}
                maxLength={TEXT_LIMITS.message}
                placeholder="Write a message…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button className="button" type="submit" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</button>
            </div>
            {error && <p className="status error" role="alert">{error}</p>}
          </form>
        ) : (
          <p className="status">
            {signedIn ? <>Confirm your email address to take part. You can request a new link in your <Link href="/account/settings">account settings</Link>.</> : <><Link href={`/login?callbackUrl=/discussion/${threadId}`}>Sign in</Link> to join the conversation.</>}
          </p>
        )
      ) : (
        <p className="status">{status === "LOCKED" ? "The host has locked this discussion. It can still be read." : "This discussion has been archived."}</p>
      )}
      {status !== "OPEN" && error && <p className="status error" role="alert">{error}</p>}
    </section>
  );
}
