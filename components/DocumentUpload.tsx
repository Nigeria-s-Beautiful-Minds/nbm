"use client";

import { useState } from "react";

/** Uploads one private PDF (a CV or portfolio) and carries its id in a hidden form field. */
export function DocumentUpload({ name, initialUploadId, maxMb }: { name: string; initialUploadId: string | null; maxMb: number }) {
  const [uploadId, setUploadId] = useState(initialUploadId ?? "");
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">(initialUploadId ? "done" : "idle");
  const [message, setMessage] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMessage("");
    if (file.type !== "application/pdf") { setState("error"); setMessage("Please choose a PDF."); return; }
    if (file.size > maxMb * 1024 * 1024) { setState("error"); setMessage(`That file is too large. The limit is ${maxMb} MB.`); return; }
    setState("uploading");
    try {
      const signRes = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: "APPLICATION_DOCUMENT", mime: file.type, size: file.size }) });
      const sign = await signRes.json().catch(() => ({}));
      if (!signRes.ok) throw new Error(sign.error || "Could not start the upload.");
      const put = await fetch(sign.url, { method: "PUT", headers: sign.headers, body: file });
      if (!put.ok) throw new Error("The upload didn't go through. Please try again.");
      const doneRes = await fetch(`/api/uploads/${sign.uploadId}/complete`, { method: "POST" });
      const done = await doneRes.json().catch(() => ({}));
      if (!doneRes.ok) throw new Error(done.error || "The file couldn't be verified.");
      setUploadId(sign.uploadId);
      setState("done");
      setMessage(`${file.name} attached.`);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "The upload didn't go through. Please try again.");
    }
  }

  return (
    <div className="field-wrap full">
      <label htmlFor={`${name}-file`}>CV or portfolio <span className="optional">(optional, PDF up to {maxMb} MB)</span></label>
      <input id={`${name}-file`} className="field" type="file" accept="application/pdf" disabled={state === "uploading"} onChange={(e) => void onFile(e.target.files?.[0])} aria-describedby={`${name}-hint`} />
      <p className="field-hint" id={`${name}-hint`}>Private. Only coordinators, and a mentor you are matched with, can open it.</p>
      {state === "uploading" && <p className="field-hint" role="status">Uploading…</p>}
      {state === "done" && <p className="field-hint" role="status">{message || "A document is attached."} {uploadId && <a href={`/api/media/${uploadId}`}>Download</a>}</p>}
      {state === "error" && <p className="field-error" role="alert">{message}</p>}
      <input type="hidden" name={name} value={uploadId} />
    </div>
  );
}
