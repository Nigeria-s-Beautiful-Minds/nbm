// Scholarships & Funding search: builds the queries, spends provider calls only when the cache
// has nothing fresh, and keeps to a per-visitor rate limit and a site-wide daily cap.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { consume } from "@/lib/rate-limit";
import { SECONDARY_DOMAINS, applyFilters, dedupe, sortOpportunities, toOpportunity } from "@/lib/scholarship-extract";
import { SearchProviderError, providerSearch, searchProviderStatus, type ProviderFailure } from "@/lib/search-provider";
import { COUNTRY_BY_CODE, EDUCATION_LEVELS, FIELDS, OPPORTUNITY_TYPES, REGIONS, type Opportunity, type ScholarshipFilters } from "@/lib/scholarships-shared";

// Bump when the queries or the extraction change, so older cached results are not reused.
const PIPELINE_VERSION = 3;
const CACHE_HOURS = 12;
const PARTIAL_CACHE_MINUTES = 30;
const VISITOR_LIMIT = 8;
const VISITOR_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_DAILY_CALLS = 30;
export const PAGE_SIZE = 10;

export type SearchOutcome =
  | { status: "ok"; opportunities: Opportunity[]; total: number; checkedAt: string; cached: boolean; partial: boolean }
  | { status: "not_configured" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "daily_cap" }
  | { status: "error"; reason: ProviderFailure };

type CachedSearch = { opportunities: Opportunity[]; checkedAt: string; partial: boolean };

const labels = <K extends string>(keys: K[], options: Record<K, string>) => keys.map((k) => options[k]);

/** Two queries per search: a broad one, and one that leaves out directories to reach official pages. */
export function buildQueries(filters: ScholarshipFilters, today: Date): string[] {
  const types = (filters.types.length ? labels(filters.types, OPPORTUNITY_TYPES) : ["Scholarships", "fellowships", "grants"]).join(" ").toLowerCase();
  const levels = labels(filters.levels, EDUCATION_LEVELS).join(" ");
  const fields = labels(filters.fields.filter((f) => f !== "other"), FIELDS).join(" ");
  const places = [
    filters.country ? COUNTRY_BY_CODE.get(filters.country)?.name : "",
    filters.euOnly ? "European Union" : "",
    ...(filters.country ? [] : labels(filters.regions.filter((r) => r !== "online"), REGIONS))
  ].filter(Boolean).join(" ");
  const online = filters.regions.includes("online") ? "online or worldwide" : "";
  const nationality = filters.nationality ? `for students from ${COUNTRY_BY_CODE.get(filters.nationality)?.name}` : "";
  const funding = filters.funding === "full" ? "fully funded" : filters.funding === "partial" ? "partial funding" : "";
  const year = today.getUTCFullYear();
  const core = [funding, types, levels, fields, places ? `in ${places}` : "", online, nationality, filters.keywords].filter(Boolean).join(" ").replace(/\s+/g, " ");
  return [
    `${core} official application eligibility deadline ${year} ${year + 1}`,
    `${core} university government foundation call for applications ${year + 1}`
  ];
}

/** Deadline window, sort, page and the expired toggle are applied after the cache, so they are free. */
function cacheKey(filters: ScholarshipFilters): string {
  const queryShape = [PIPELINE_VERSION, [...filters.types].sort(), [...filters.levels].sort(), [...filters.fields].sort(), [...filters.regions].sort(), filters.country, filters.euOnly, filters.nationality, filters.funding, filters.keywords.toLowerCase()];
  return createHash("sha256").update(JSON.stringify(queryShape)).digest("hex").slice(0, 40);
}

export const searchKey = cacheKey;

// The database is the cache that holds across server instances; memory backs it up if a query fails.
const memory = new Map<string, { value: CachedSearch; expiresAt: number }>();
const inFlight = new Map<string, Promise<CachedSearch>>();
let memoryCalls = { day: "", count: 0 };

const utcDay = (date: Date) => date.toISOString().slice(0, 10);
const startOfUtcDay = (date: Date) => new Date(`${utcDay(date)}T00:00:00.000Z`);

async function readCache(key: string, now: Date): Promise<CachedSearch | null> {
  const local = memory.get(key);
  if (local && local.expiresAt > now.getTime()) return local.value;
  try {
    const row = await prisma.searchCache.findUnique({ where: { key } });
    if (row && row.expiresAt > now) return row.payload as unknown as CachedSearch;
  } catch { /* fall through to a live search */ }
  return null;
}

async function writeCache(key: string, value: CachedSearch, calls: number, now: Date): Promise<void> {
  const expiresAt = new Date(now.getTime() + (value.partial ? PARTIAL_CACHE_MINUTES * 60_000 : CACHE_HOURS * 3_600_000));
  if (memory.size > 200) memory.clear();
  memory.set(key, { value, expiresAt: expiresAt.getTime() });
  try {
    const previous = await prisma.searchCache.findUnique({ where: { key }, select: { providerCalls: true, fetchedAt: true } });
    const carried = previous && previous.fetchedAt >= startOfUtcDay(now) ? previous.providerCalls : 0;
    const data = { payload: value as never, providerCalls: carried + calls, fetchedAt: now, expiresAt };
    await prisma.searchCache.upsert({ where: { key }, update: data, create: { key, ...data } });
    await prisma.searchCache.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } } });
  } catch { /* the in-memory copy still serves this instance */ }
}

function dailyCap(): number {
  const configured = Number(process.env.SCHOLARSHIP_SEARCH_DAILY_CALLS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_DAILY_CALLS;
}

async function callsToday(now: Date): Promise<number> {
  const inMemory = memoryCalls.day === utcDay(now) ? memoryCalls.count : 0;
  try {
    const sum = await prisma.searchCache.aggregate({ _sum: { providerCalls: true }, where: { fetchedAt: { gte: startOfUtcDay(now) } } });
    return Math.max(sum._sum.providerCalls ?? 0, inMemory);
  } catch {
    return inMemory;
  }
}

async function liveSearch(key: string, filters: ScholarshipFilters, now: Date): Promise<CachedSearch> {
  const queries = buildQueries(filters, now);
  memoryCalls = { day: utcDay(now), count: (memoryCalls.day === utcDay(now) ? memoryCalls.count : 0) + queries.length };
  const settled = await Promise.allSettled(queries.map((q, i) => providerSearch(q, i === 1 ? { excludeDomains: SECONDARY_DOMAINS } : {})));
  const answered = settled.filter((s) => s.status === "fulfilled");
  if (answered.length === 0) throw (settled[0] as PromiseRejectedResult).reason;
  const context = { today: now, applicantCountry: filters.nationality };
  const opportunities = dedupe(answered.flatMap((s) => s.value).map((raw) => toOpportunity(raw, context)).filter((o): o is Opportunity => o !== null));
  const value = { opportunities, checkedAt: now.toISOString(), partial: answered.length < queries.length };
  await writeCache(key, value, queries.length, now);
  return value;
}

/**
 * Runs (or reuses) a search and returns the cards for these filters, already filtered and sorted.
 * `visitor` identifies who to rate limit, normally the client IP.
 */
export async function searchScholarships(filters: ScholarshipFilters, visitor: string, now = new Date()): Promise<SearchOutcome> {
  if (!searchProviderStatus().configured) return { status: "not_configured" };
  const key = cacheKey(filters);
  let cached = true;
  let found = await readCache(key, now);

  if (!found) {
    cached = false;
    let pending = inFlight.get(key);
    if (!pending) {
      // Only searches that will cost a provider call count against the visitor and the daily cap.
      const limit = consume(`scholarships:${visitor}`, VISITOR_LIMIT, VISITOR_WINDOW_MS);
      if (limit.limited) return { status: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds };
      if ((await callsToday(now)) + 2 > dailyCap()) return { status: "daily_cap" };
      pending = liveSearch(key, filters, now).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }
    try {
      found = await pending;
    } catch (error) {
      if (!(error instanceof SearchProviderError)) console.error("[scholarships] search failed", error);
      else console.error(`[scholarships] provider failure: ${error.kind}`);
      return { status: "error", reason: error instanceof SearchProviderError ? error.kind : "upstream" };
    }
  }

  const visible = sortOpportunities(applyFilters(found.opportunities, filters, now), filters.sort);
  return { status: "ok", opportunities: visible, total: visible.length, checkedAt: found.checkedAt, cached, partial: found.partial };
}
