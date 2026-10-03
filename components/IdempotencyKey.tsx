"use client";

import { useState } from "react";

/** A random key created once per page view, so a double-submit or retry can't create a second record. */
export function IdempotencyKey({ name = "idempotencyKey" }: { name?: string }) {
  const [key] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`));
  return <input type="hidden" name={name} value={key} suppressHydrationWarning />;
}
