"use client";

import { useEffect, useState } from "react";

function localInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The host picks a time in their own zone; it is sent to the server as UTC with the zone's name. */
export function RoomScheduleFields() {
  const [local, setLocal] = useState("");
  const [timezone, setTimezone] = useState("UTC");

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setLocal(localInputValue(new Date(Date.now() + 5 * 60 * 1000)));
  }, []);

  const utc = local && !Number.isNaN(new Date(local).getTime()) ? new Date(local).toISOString() : "";

  return (
    <div className="field-wrap full">
      <label htmlFor="startsAtLocal">Start date and time</label>
      <input id="startsAtLocal" className="field" type="datetime-local" required value={local} onChange={(e) => setLocal(e.target.value)} aria-describedby="startsAt-hint" />
      <p className="field-hint" id="startsAt-hint">In your time zone ({timezone}). Everyone else sees it converted to theirs. Leave it as it is to start in a few minutes.</p>
      <input type="hidden" name="startsAtUtc" value={utc} />
      <input type="hidden" name="timezone" value={timezone} />
    </div>
  );
}
