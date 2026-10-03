"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { REACTIONS, TEXT_LIMITS, formatDate, type ReactionEmoji } from "@/lib/constants";
import type { CommentNode, ExhibitionDetail, MediaItem } from "@/lib/exhibitions-shared";
import { ReportButton } from "@/components/ReportButton";

export function Gallery({ media }: { media: MediaItem[] }) {
  const [index, setIndex] = useState(0);
  const current = media[Math.min(index, media.length - 1)];
  if (!current) return null;
  return (
    <div className="gallery">
      <div className="gallery-main">
        {current.kind === "IMAGE"
          ? <img src={current.url} alt={current.alt} width={current.width ?? undefined} height={current.height ?? undefined} />
          // Never autoplays: playing video is always the viewer's choice (and their data).
          : <video src={current.url} controls preload="metadata" playsInline aria-label={current.alt} />}
      </div>
      <p className="media-caption">{current.alt}</p>
      {media.length > 1 && (
        <div className="gallery-thumbs" role="group" aria-label="Project photos">
          {media.map((item, i) => (
            <button key={item.id} type="button" className="gallery-thumb" aria-current={i === index} aria-label={`Show photo ${i + 1} of ${media.length}`} onClick={() => setIndex(i)}>
              <img src={item.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExhibitionEngagement({ post, canInteract, signedIn }: { post: ExhibitionDetail; canInteract: boolean; signedIn: boolean }) {
  const [reactionCounts, setReactionCounts] = useState(post.reactionCounts);
  const [viewerReaction, setViewerReaction] = useState(post.viewerReaction);
  const [saved, setSaved] = useState(post.saved);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function react(emoji: ReactionEmoji) {
    if (!canInteract) return;
    setError("");
    const turningOff = viewerReaction === emoji;
    const previous = { counts: reactionCounts, reaction: viewerReaction };

    // Optimistic update so the bar feels instant; rolled back if the request fails.
    setReactionCounts((counts) => {
      const next = { ...counts };
      if (previous.reaction) next[previous.reaction] = Math.max(0, (next[previous.reaction] ?? 1) - 1);
      if (!turningOff) next[emoji] = (next[emoji] ?? 0) + 1;
      return next;
    });
    setViewerReaction(turningOff ? null : emoji);

    const rollback = (message: string) => { setReactionCounts(previous.counts); setViewerReaction(previous.reaction); setError(message); };
    try {
      const res = turningOff
        ? await fetch(`/api/exhibitions/${post.id}/reactions`, { method: "DELETE" })
        : await fetch(`/api/exhibitions/${post.id}/reactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }) });
      if (!res.ok) rollback((await res.json().catch(() => ({}))).error || "Could not save your reaction.");
    } catch {
      rollback("Could not save your reaction. Check your connection.");
    }
  }

  async function toggleSave() {
    if (!canInteract) return;
    const next = !saved;
    setSaved(next);
    try {
      const res = await fetch(`/api/exhibitions/${post.id}/save`, { method: next ? "POST" : "DELETE" });
      if (!res.ok) setSaved(!next);
    } catch {
      setSaved(!next);
    }
  }

  async function share() {
    const url = `${window.location.origin}/exhibitions/${post.slug}`;
    try {
      if (navigator.share) await navigator.share({ title: post.title, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    } catch {
      // Sharing was dismissed; nothing to do.
    }
  }

  return (
    <>
      <div className="reactions" role="group" aria-label="React to this project">
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={`reaction-btn${viewerReaction === emoji ? " active" : ""}`}
            disabled={!canInteract}
            onClick={() => react(emoji)}
            aria-pressed={viewerReaction === emoji}
            title={canInteract ? undefined : "Sign in to react"}
          >
            <span>{emoji}</span>
            {(reactionCounts[emoji] ?? 0) > 0 && <span className="reaction-count">{reactionCounts[emoji]}</span>}
          </button>
        ))}
      </div>
      <div className="row">
        {canInteract && <button type="button" className="button small secondary" aria-pressed={saved} onClick={toggleSave}>{saved ? "Saved ✓" : "Save"}</button>}
        <button type="button" className="button small ghost" onClick={share}>{copied ? "Link copied" : "Share link"}</button>
        {signedIn && !post.isOwn && <ReportButton targetType="EXHIBITION" targetId={post.id} label="Report" />}
      </div>
      {!signedIn && <p className="muted small mt-2"><Link href={`/login?callbackUrl=/exhibitions/${post.slug}`}>Sign in</Link> to react, save or comment.</p>}
      {error && <p className="status error mt-2" role="alert">{error}</p>}
    </>
  );
}

function CommentItem({
  comment,
  postId,
  canInteract,
  isModerator,
  onReply,
  onRemoved
}: {
  comment: CommentNode;
  postId: string;
  canInteract: boolean;
  isModerator: boolean;
  onReply?: (comment: CommentNode) => void;
  onRemoved: (id: string) => void;
}) {
  async function remove() {
    if (!window.confirm("Remove this comment?")) return;
    const res = await fetch(`/api/exhibitions/${postId}/comments/${comment.id}`, { method: "DELETE" });
    if (res.ok) onRemoved(comment.id);
  }

  return (
    <li className="comment">
      {comment.removed ? (
        <p className="comment-body muted"><em>This comment was removed.</em></p>
      ) : (
        <>
          <p className="comment-meta">
            <strong>{comment.authorName}</strong>
            <span>{formatDate(comment.createdAt)}</span>
            {canInteract && onReply && <button type="button" className="text-button small" onClick={() => onReply(comment)}>Reply</button>}
            {(comment.isOwn || isModerator) && <button type="button" className="text-button danger small" onClick={remove}>Remove</button>}
            {canInteract && !comment.isOwn && <ReportButton targetType="EXHIBITION_COMMENT" targetId={comment.id} label="Report" compact />}
          </p>
          <p className="comment-body">{comment.body}</p>
        </>
      )}
      {comment.replies.length > 0 && (
        <ul className="comment-list" style={{ marginTop: 0 }}>
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} postId={postId} canInteract={canInteract} isModerator={isModerator} onReply={onReply ? () => onReply(comment) : undefined} onRemoved={onRemoved} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ExhibitionComments({ postId, slug, initialComments, canInteract, isModerator }: { postId: string; slug: string; initialComments: CommentNode[]; canInteract: boolean; isModerator: boolean }) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentNode | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const total = comments.reduce((sum, c) => sum + (c.removed ? 0 : 1) + c.replies.length, 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const text = body.trim();
    if (!text) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/exhibitions/${postId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text, parentId: replyTo?.id ?? null }) });
      const data = await res.json().catch(() => ({}));
      // On failure the text stays in the box so nothing has to be retyped.
      if (!res.ok) { setError(data.error || "Could not post your comment."); return; }
      setComments((list) => (replyTo ? list.map((c) => (c.id === replyTo.id ? { ...c, replies: [...c.replies, data.comment] } : c)) : [...list, data.comment]));
      setBody("");
      setReplyTo(null);
    } catch {
      setError("Could not post your comment. Check your connection and try again.");
    } finally {
      setPosting(false);
    }
  }

  function removed(id: string) {
    setComments((list) => list.filter((c) => c.id !== id || c.replies.length > 0).map((c) => (c.id === id ? { ...c, removed: true, body: "" } : { ...c, replies: c.replies.filter((r) => r.id !== id) })));
  }

  return (
    <section id="comments" aria-labelledby="comments-title" className="mt-3">
      <h2 id="comments-title">{total} comment{total === 1 ? "" : "s"}</h2>
      {canInteract ? (
        <form className="comment-form" onSubmit={submit}>
          {replyTo && (
            <p className="muted small mb-0">Replying to {replyTo.authorName}. <button type="button" className="text-button small" onClick={() => setReplyTo(null)}>Cancel reply</button></p>
          )}
          <label className="sr-only" htmlFor="comment-body">{replyTo ? "Write a reply" : "Write a comment"}</label>
          <textarea id="comment-body" className="field" rows={3} maxLength={TEXT_LIMITS.comment} placeholder="Ask a question, share a finding or offer to collaborate…" value={body} onChange={(e) => setBody(e.target.value)} />
          <button className="button" type="submit" disabled={posting || !body.trim()}>{posting ? "Posting…" : replyTo ? "Reply" : "Comment"}</button>
          {error && <p className="status error" role="alert">{error}</p>}
        </form>
      ) : (
        <p className="status"><Link href={`/login?callbackUrl=/exhibitions/${slug}`}>Sign in</Link> with a confirmed email to join the conversation.</p>
      )}

      {comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              postId={postId}
              canInteract={canInteract}
              isModerator={isModerator}
              onReply={(target) => { setReplyTo(target); document.getElementById("comment-body")?.focus(); }}
              onRemoved={removed}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
