"use client";

import { useState } from "react";

/** Uploads one editorial image (news cover or team photo) and carries its id in a hidden field. */
export function ImageUploadField({ name, purpose, label, initialUploadId }: { name: string; purpose: "NEWS_COVER" | "TEAM_PHOTO"; label: string; initialUploadId: string | null }) {
  const [uploadId, setUploadId] = useState(initialUploadId ?? "");
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setState("uploading");
    setMessage("");
    try {
      const signRes = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose, mime: file.type, size: file.size }) });
      const sign = await signRes.json().catch(() => ({}));
      if (!signRes.ok) throw new Error(sign.error || "Could not start the upload.");
      const put = await fetch(sign.url, { method: "PUT", headers: sign.headers, body: file });
      if (!put.ok) throw new Error("The upload didn't go through.");
      const doneRes = await fetch(`/api/uploads/${sign.uploadId}/complete`, { method: "POST" });
      const done = await doneRes.json().catch(() => ({}));
      if (!doneRes.ok) throw new Error(done.error || "The file couldn't be verified.");
      setUploadId(sign.uploadId);
      setState("idle");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "The upload didn't go through.");
    }
  }

  return (
    <div className="field-wrap full">
      <label htmlFor={`${name}-file`}>{label} <span className="optional">(optional; PNG, JPEG or WEBP)</span></label>
      {uploadId && <img src={`/api/media/${uploadId}`} alt="" style={{ maxWidth: 220, borderRadius: 10 }} />}
      <input id={`${name}-file`} className="field" type="file" accept="image/png,image/jpeg,image/webp" disabled={state === "uploading"} onChange={(e) => void onFile(e.target.files?.[0])} />
      {state === "uploading" && <p className="field-hint" role="status">Uploading…</p>}
      {state === "error" && <p className="field-error" role="alert">{message}</p>}
      {uploadId && <button type="button" className="text-button danger small" style={{ alignSelf: "flex-start" }} onClick={() => setUploadId("")}>Remove image</button>}
      <input type="hidden" name={name} value={uploadId} />
    </div>
  );
}
