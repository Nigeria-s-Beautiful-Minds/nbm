"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IMAGE_MIME_TYPES, PROJECT_STAGES, TEXT_LIMITS, TOPICS, VIDEO_MIME_TYPES, type PilotLimits } from "@/lib/constants";
import type { ExhibitionInput, ExhibitionStatusKind } from "@/lib/exhibitions-shared";

type Item = {
  key: string;
  kind: "IMAGE" | "VIDEO";
  previewUrl: string;
  alt: string;
  width: number | null;
  height: number | null;
  file?: File;
  uploadId?: string;
  progress: number;
  state: "uploading" | "done" | "error";
  error?: string;
};

type LinkOption = { id: string; title: string };

export type EditorInitial = {
  id: string;
  slug: string;
  status: ExhibitionStatusKind;
  revisionStatus: "NONE" | "PENDING" | "REJECTED";
  moderationNote: string | null;
  values: ExhibitionInput;
  media: { uploadId: string; url: string; kind: "IMAGE" | "VIDEO"; alt: string; width: number | null; height: number | null }[];
};

function kindFor(mime: string): "IMAGE" | "VIDEO" | null {
  if ((IMAGE_MIME_TYPES as readonly string[]).includes(mime)) return "IMAGE";
  if ((VIDEO_MIME_TYPES as readonly string[]).includes(mime)) return "VIDEO";
  return null;
}

// Reads dimensions (and video length) off the file before upload, to fail fast and to reserve the
// right aspect ratio. The server re-checks the stored file itself.
function inspect(file: File, kind: "IMAGE" | "VIDEO"): Promise<{ width: number | null; height: number | null; duration: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (width: number | null, height: number | null, duration: number | null) => { URL.revokeObjectURL(url); resolve({ width, height, duration }); };
    if (kind === "IMAGE") {
      const img = new Image();
      img.onload = () => done(img.naturalWidth || null, img.naturalHeight || null, null);
      img.onerror = () => done(null, null, null);
      img.src = url;
    } else {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => done(video.videoWidth || null, video.videoHeight || null, Number.isFinite(video.duration) ? video.duration : null);
      video.onerror = () => done(null, null, null);
      video.src = url;
    }
  });
}

function putWithProgress(url: string, headers: Record<string, string>, file: File, onProgress: (percent: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

export function ExhibitionEditor({
  initial,
  limits,
  canPublishDirect,
  links
}: {
  initial: EditorInitial | null;
  limits: PilotLimits;
  canPublishDirect: boolean;
  links: { threads: LinkOption[]; opportunities: LinkOption[]; campaigns: LinkOption[] };
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<{ id: string; slug: string; status: ExhibitionStatusKind } | null>(initial ? { id: initial.id, slug: initial.slug, status: initial.status } : null);
  const [items, setItems] = useState<Item[]>(
    () => initial?.media.map((m) => ({ key: m.uploadId, kind: m.kind, previewUrl: m.url, alt: m.alt, width: m.width, height: m.height, uploadId: m.uploadId, progress: 100, state: "done" as const })) ?? []
  );
  const [busy, setBusy] = useState<"" | "draft" | "submit" | "withdraw" | "delete">("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => () => { itemsRef.current.forEach((item) => { if (item.file) URL.revokeObjectURL(item.previewUrl); }); }, []);

  const patch = (key: string, change: Partial<Item>) => setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));

  async function upload(item: Item) {
    if (!item.file) return;
    patch(item.key, { state: "uploading", progress: 0, error: undefined });
    try {
      const signRes = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "EXHIBITION_MEDIA", mime: item.file.type, size: item.file.size })
      });
      const sign = await signRes.json().catch(() => ({}));
      if (!signRes.ok) return patch(item.key, { state: "error", error: sign.error || "Could not start the upload." });

      const sent = await putWithProgress(sign.url, sign.headers, item.file, (progress) => patch(item.key, { progress }));
      if (!sent) return patch(item.key, { state: "error", error: "The upload didn't go through. Check your connection and retry." });

      const doneRes = await fetch(`/api/uploads/${sign.uploadId}/complete`, { method: "POST" });
      const done = await doneRes.json().catch(() => ({}));
      if (!doneRes.ok) return patch(item.key, { state: "error", error: done.error || "The file couldn't be verified." });

      patch(item.key, { state: "done", progress: 100, uploadId: sign.uploadId });
    } catch {
      patch(item.key, { state: "error", error: "The upload didn't go through. Check your connection and retry." });
    }
  }

  async function addFiles(files: FileList | null) {
    setError("");
    if (!files?.length) return;
    const next: Item[] = [];
    for (const file of Array.from(files)) {
      const kind = kindFor(file.type);
      if (!kind) { setError("Please choose PNG, JPEG or WEBP photos, or one MP4 video."); continue; }
      const current = [...itemsRef.current, ...next];
      if (current.some((i) => i.kind === "VIDEO") || (kind === "VIDEO" && current.length > 0)) { setError("A post can have one short video, or photos, but not both."); continue; }
      if (kind === "IMAGE" && current.length >= limits.imagesPerPost) { setError(`A post can have up to ${limits.imagesPerPost} photos.`); break; }
      const maxMb = kind === "IMAGE" ? limits.imageMaxMb : limits.videoMaxMb;
      if (file.size > maxMb * 1024 * 1024) { setError(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${maxMb} MB.`); continue; }
      const info = await inspect(file, kind);
      if (kind === "VIDEO" && info.duration === null) { setError("This browser can't play that video. Please upload a standard MP4 (H.264)."); continue; }
      if (kind === "VIDEO" && info.duration! > limits.videoMaxSeconds) { setError(`That video is ${Math.round(info.duration!)} seconds long. The limit is ${Math.round(limits.videoMaxSeconds / 60)} minutes.`); continue; }
      next.push({ key: crypto.randomUUID(), kind, file, previewUrl: URL.createObjectURL(file), alt: "", width: info.width, height: info.height, progress: 0, state: "uploading" });
    }
    if (!next.length) return;
    setItems((list) => [...list, ...next]);
    for (const item of next) void upload(item);
  }

  function remove(key: string) {
    setItems((list) => {
      const item = list.find((i) => i.key === key);
      if (item?.file) URL.revokeObjectURL(item.previewUrl);
      return list.filter((i) => i.key !== key);
    });
  }

  async function save(event: FormEvent<HTMLFormElement>, intent: "draft" | "submit") {
    event.preventDefault();
    setError("");
    setStatus("");
    if (items.some((i) => i.state === "uploading")) { setError("Please wait for the uploads to finish."); return; }
    if (items.some((i) => i.state === "error")) { setError("One of the files didn't upload. Retry it or remove it before saving."); return; }

    const form = new FormData(event.currentTarget);
    const payload = {
      intent,
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      topic: String(form.get("topic") ?? ""),
      stage: String(form.get("stage") ?? ""),
      teamCredits: String(form.get("teamCredits") ?? ""),
      projectUrl: String(form.get("projectUrl") ?? ""),
      linkedThreadId: String(form.get("linkedThreadId") ?? ""),
      linkedOpportunityId: String(form.get("linkedOpportunityId") ?? ""),
      linkedCampaignId: String(form.get("linkedCampaignId") ?? ""),
      media: items.map((i) => ({ uploadId: i.uploadId, alt: i.alt, width: i.width, height: i.height }))
    };

    setBusy(intent);
    try {
      // Once a post exists, every later save updates it, so a retry never creates a second post.
      const res = await fetch(saved ? `/api/exhibitions/${saved.id}` : "/api/exhibitions", {
        method: saved ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not save. Your text is still here; please try again."); return; }
      setSaved({ id: data.id, slug: data.slug, status: data.status });
      setStatus(data.message);
      if (intent === "submit") { router.push(`/exhibitions/${data.slug}`); router.refresh(); }
      else if (!saved) router.replace(`/exhibitions/${data.slug}/edit`);
    } catch {
      setError("Could not save. Check your connection and try again; nothing you typed has been lost.");
    } finally {
      setBusy("");
    }
  }

  async function withdraw() {
    if (!saved || !window.confirm("Withdraw this post? It will leave the public feed and the review queue. You can edit and resubmit it later.")) return;
    setBusy("withdraw");
    const res = await fetch(`/api/exhibitions/${saved.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "withdraw" }) });
    setBusy("");
    if (res.ok) { router.push("/account/workspace"); router.refresh(); } else setError("Could not withdraw the post. Please try again.");
  }

  async function destroy() {
    if (!saved || !window.confirm("Delete this post and its media permanently? This cannot be undone.")) return;
    setBusy("delete");
    const res = await fetch(`/api/exhibitions/${saved.id}`, { method: "DELETE" });
    setBusy("");
    if (res.ok) { router.push("/account/workspace"); router.refresh(); } else setError("Could not delete the post. Please try again.");
  }

  const values = initial?.values;
  const isLive = saved?.status === "APPROVED";
  const submitLabel = isLive ? (canPublishDirect ? "Save changes" : "Send changes for review") : canPublishDirect ? "Publish" : "Submit for review";
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} className="form-grid" onSubmit={(e) => save(e, "submit")}>
      {initial?.moderationNote && (
        <div className="notice warn full"><p><strong>Reviewer&rsquo;s note:</strong> {initial.moderationNote}</p></div>
      )}
      {initial?.revisionStatus === "PENDING" && (
        <div className="notice full"><p>Your last edit is awaiting review. The earlier approved version is what visitors see. Saving again replaces the pending edit.</p></div>
      )}

      <div className="field-wrap full">
        <label htmlFor="title">{canPublishDirect ? <>Title <span className="optional">(optional: your caption is used if you leave it blank)</span></> : "Project title"}</label>
        <input id="title" name="title" className="field" required={!canPublishDirect} minLength={canPublishDirect ? undefined : 3} maxLength={TEXT_LIMITS.title} defaultValue={values?.title} placeholder="What are you sharing?" />
      </div>

      <div className="field-wrap">
        <label htmlFor="topic">Topic</label>
        <select id="topic" name="topic" className="field" defaultValue={values?.topic ?? ""}>
          <option value="">Choose…</option>
          {TOPICS.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
        </select>
      </div>
      <div className="field-wrap">
        <label htmlFor="stage">Project stage</label>
        <select id="stage" name="stage" className="field" defaultValue={values?.stage ?? ""} aria-describedby="stage-hint">
          <option value="">Choose…</option>
          {Object.entries(PROJECT_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <p className="field-hint" id="stage-hint">Say what has actually been shown so far. Early ideas are welcome.</p>
      </div>

      <div className="field-wrap full">
        <label htmlFor="description">{canPublishDirect ? <>Caption <span className="optional">(optional)</span></> : "Description"}</label>
        <textarea id="description" name="description" className="field" rows={7} maxLength={TEXT_LIMITS.description} defaultValue={values?.description} placeholder={canPublishDirect ? "A few words about this photo or video, for people who visit the page." : "What problem does it address, what have you built or found so far, and what help are you looking for?"} />
      </div>

      <div className="field-wrap full">
        <span className="form-label" id="media-label">Photos or a short video</span>
        <p className="field-hint" id="media-hint">Up to {limits.imagesPerPost} photos (PNG, JPEG or WEBP, {limits.imageMaxMb} MB each), or one MP4 video up to {limits.videoMaxMb} MB and {Math.round(limits.videoMaxSeconds / 60)} minutes.</p>
        {items.length > 0 && (
          <ul className="uploader-list" aria-labelledby="media-label">
            {items.map((item, index) => (
              <li key={item.key} className="uploader-item">
                <div className="uploader-thumb">
                  {item.kind === "IMAGE" ? <img src={item.previewUrl} alt="" /> : <video src={item.previewUrl} preload="metadata" muted playsInline />}
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  <div className="field-wrap">
                    <label htmlFor={`alt-${item.key}`}>Describe this {item.kind === "IMAGE" ? "photo" : "video"}</label>
                    <input id={`alt-${item.key}`} className="field" maxLength={TEXT_LIMITS.alt} value={item.alt} onChange={(e) => patch(item.key, { alt: e.target.value })} placeholder="e.g. A soil-moisture sensor mounted beside a cassava ridge" />
                  </div>
                  {item.state === "uploading" && (
                    <div role="status">
                      <div className="progress" aria-hidden="true"><span style={{ width: `${item.progress}%` }} /></div>
                      <p className="field-hint">Uploading… {item.progress}%</p>
                    </div>
                  )}
                  {item.state === "error" && <p className="field-error" role="alert">{item.error}</p>}
                  <div className="row">
                    {item.state === "error" && <button type="button" className="button small secondary" onClick={() => upload(item)}>Retry upload</button>}
                    <button type="button" className="text-button danger small" onClick={() => remove(item.key)} aria-label={`Remove ${item.kind === "IMAGE" ? "photo" : "video"} ${index + 1}`}>Remove</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <input
          className="field"
          type="file"
          multiple
          aria-labelledby="media-label"
          aria-describedby="media-hint"
          accept={[...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES].join(",")}
          onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      <div className="field-wrap">
        <label htmlFor="teamCredits">Team credits <span className="optional">(optional)</span></label>
        <input id="teamCredits" name="teamCredits" className="field" maxLength={500} defaultValue={values?.teamCredits} placeholder="Who worked on this?" />
      </div>
      <div className="field-wrap">
        <label htmlFor="projectUrl">Project link <span className="optional">(optional)</span></label>
        <input id="projectUrl" name="projectUrl" className="field" type="url" defaultValue={values?.projectUrl} placeholder="https://" />
      </div>

      {(links.threads.length > 0 || links.opportunities.length > 0 || links.campaigns.length > 0) && (
        <fieldset className="full panel" style={{ margin: 0 }}>
          <legend className="form-label">Connect this project <span className="optional">(optional)</span></legend>
          <div className="form-grid">
            {links.threads.length > 0 && (
              <div className="field-wrap">
                <label htmlFor="linkedThreadId">Your discussion</label>
                <select id="linkedThreadId" name="linkedThreadId" className="field" defaultValue={values?.linkedThreadId ?? ""}>
                  <option value="">None</option>
                  {links.threads.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              </div>
            )}
            {links.opportunities.length > 0 && (
              <div className="field-wrap">
                <label htmlFor="linkedOpportunityId">Your mentorship opportunity</label>
                <select id="linkedOpportunityId" name="linkedOpportunityId" className="field" defaultValue={values?.linkedOpportunityId ?? ""}>
                  <option value="">None</option>
                  {links.opportunities.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              </div>
            )}
            {links.campaigns.length > 0 && (
              <div className="field-wrap">
                <label htmlFor="linkedCampaignId">Your approved sponsorship campaign</label>
                <select id="linkedCampaignId" name="linkedCampaignId" className="field" defaultValue={values?.linkedCampaignId ?? ""}>
                  <option value="">None</option>
                  {links.campaigns.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              </div>
            )}
          </div>
        </fieldset>
      )}

      <div className="full form-actions">
        <button className="button" type="submit" disabled={busy !== ""}>{busy === "submit" ? "Sending…" : submitLabel}</button>
        {!isLive && (
          <button
            className="button secondary"
            type="button"
            disabled={busy !== ""}
            onClick={() => { if (formRef.current?.reportValidity()) void save({ preventDefault() {}, currentTarget: formRef.current } as unknown as FormEvent<HTMLFormElement>, "draft"); }}
          >
            {busy === "draft" ? "Saving…" : "Save draft"}
          </button>
        )}
        {saved && (saved.status === "PENDING" || saved.status === "APPROVED") && (
          <button className="button ghost" type="button" disabled={busy !== ""} onClick={withdraw}>{busy === "withdraw" ? "Withdrawing…" : "Withdraw"}</button>
        )}
        {saved && <button className="button danger" type="button" disabled={busy !== ""} onClick={destroy}>{busy === "delete" ? "Deleting…" : "Delete"}</button>}
        {saved && <Link href={`/exhibitions/${saved.slug}`}>Preview</Link>}
      </div>
      {!canPublishDirect && !isLive && <p className="field-hint full">Posts from members are reviewed before they appear publicly. Until then only you and our reviewers can see them.</p>}
      {status && <p className="status success full" role="status">{status}</p>}
      {error && <p className="status error full" role="alert">{error}</p>}
    </form>
  );
}
