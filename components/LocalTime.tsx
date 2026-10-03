"use client";

import { useEffect, useState } from "react";

const options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" };

/**
 * A stored UTC time shown in the reader's own time zone. The server renders it in West Africa
 * Time so the page is useful before JavaScript loads; the browser then swaps in local time.
 */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState(() => new Date(iso).toLocaleString("en-GB", { ...options, timeZone: "Africa/Lagos" }));
  useEffect(() => setText(new Date(iso).toLocaleString("en-GB", options)), [iso]);
  return <time dateTime={iso} suppressHydrationWarning>{text}</time>;
}
