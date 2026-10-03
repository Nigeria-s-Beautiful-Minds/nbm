// In-memory fixed-window limiter. State lives per serverless instance, so it slows
// online guessing and reset abuse but is not a shared/global limit. For a limit that
// holds across all instances, swap the Map for a shared store (e.g. Upstash Redis).
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

function prune(now: number) {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function live(key: string, now: number): Bucket | undefined {
  const bucket = buckets.get(key);
  if (bucket && bucket.resetAt > now) return bucket;
  if (bucket) buckets.delete(key);
  return undefined;
}

export type LimitResult = { limited: boolean; retryAfterSeconds: number };

/** Read-only check: is this key already over its limit? */
export function isLimited(key: string, limit: number): LimitResult {
  const now = Date.now();
  const bucket = live(key, now);
  if (bucket && bucket.count >= limit) {
    return { limited: true, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

/** Record one event against a key, starting a new window if none is active. */
export function recordHit(key: string, windowMs: number): void {
  const now = Date.now();
  prune(now);
  const bucket = live(key, now);
  if (bucket) {
    bucket.count += 1;
  } else {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  }
}

/** Check then record in one step; counts every call (used where all requests should count). */
export function consume(key: string, limit: number, windowMs: number): LimitResult {
  const result = isLimited(key, limit);
  if (!result.limited) recordHit(key, windowMs);
  return result;
}

export function resetKey(key: string): void {
  buckets.delete(key);
}

/** Client IP as seen by Vercel; falls back to the first X-Forwarded-For hop. */
export function clientIp(headers: Headers | Record<string, string | string[] | undefined>): string {
  const read = (name: string): string => {
    if (headers instanceof Headers) return headers.get(name) ?? "";
    const value = headers[name];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  };
  const forwarded = read("x-vercel-forwarded-for") || read("x-real-ip") || read("x-forwarded-for");
  return forwarded.split(",")[0].trim() || "unknown";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
