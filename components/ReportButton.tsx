"use client";

import { FormEvent, useRef, useState } from "react";
import { REPORT_REASONS } from "@/lib/constants";

/** Opens a small dialog to report a post, comment, message or room to the moderators. */
export function ReportButton({ targetType, targetId, label = "Report", compact = false }: { targetType: string; targetId: string; label?: string; compact?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    setSending(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason: form.get("reason"), details: form.get("details") })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not send your report."); return; }
      setDone(data.message || "Thank you. Our moderators will review this.");
    } catch {
      setError("Could not send your report. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button type="button" className={compact ? "text-button small" : "button small ghost"} onClick={() => { setDone(""); setError(""); dialogRef.current?.showModal(); }}>{label}</button>
      <dialog ref={dialogRef} className="dialog" aria-labelledby={`report-title-${targetId}`}>
        <h2 id={`report-title-${targetId}`}>Report to moderators</h2>
        {done ? (
          <>
            <p className="status success" role="status">{done}</p>
            <p className="mt-2 mb-0"><button type="button" className="button" onClick={() => dialogRef.current?.close()}>Close</button></p>
          </>
        ) : (
          <form className="stack" onSubmit={submit}>
            <div className="field-wrap">
              <label htmlFor={`report-reason-${targetId}`}>What&rsquo;s wrong?</label>
              <select id={`report-reason-${targetId}`} name="reason" className="field" required defaultValue="">
                <option value="" disabled>Choose a reason…</option>
                {REPORT_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </select>
            </div>
            <div className="field-wrap">
              <label htmlFor={`report-details-${targetId}`}>Anything else we should know? <span className="optional">(optional)</span></label>
              <textarea id={`report-details-${targetId}`} name="details" className="field" rows={3} maxLength={1000} />
            </div>
            {error && <p className="status error" role="alert">{error}</p>}
            <div className="form-actions">
              <button className="button" type="submit" disabled={sending}>{sending ? "Sending…" : "Send report"}</button>
              <button className="button ghost" type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
