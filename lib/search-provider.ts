// Web search for Scholarships & Funding, through a search API (Tavily). Server-only: the key is
// read from the environment here and never reaches the browser. This is an API built for
// programmatic search; no search-engine result pages are scraped.
import { z } from "zod";
import type { RawSearchResult } from "@/lib/scholarship-extract";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const TIMEOUT_MS = 20_000;
const MAX_RESULTS = 20;
const RAW_CONTENT_LIMIT = 20_000;

export type ProviderFailure = "auth" | "quota" | "rate" | "timeout" | "upstream" | "bad_response";

export class SearchProviderError extends Error {
  constructor(public readonly kind: ProviderFailure, message: string) {
    super(message);
    this.name = "SearchProviderError";
  }
}

/** A key is all the live integration needs. Without one the page says so instead of searching. */
export function searchProviderStatus(): { configured: boolean; name: string } {
  return { configured: Boolean(process.env.TAVILY_API_KEY?.trim()), name: "Tavily" };
}

// Outside production the endpoint can point at tests/mock-search-provider.ts, so the pipeline and
// its failure handling can be exercised without spending credits.
function endpoint(): string {
  const override = process.env.SCHOLARSHIP_SEARCH_ENDPOINT?.trim();
  return override && process.env.SITE_STAGE !== "production" ? override : TAVILY_ENDPOINT;
}

const responseShape = z.object({
  results: z.array(z.object({
    title: z.string().nullish(),
    url: z.string().nullish(),
    content: z.string().nullish(),
    raw_content: z.string().nullish(),
    score: z.number().nullish()
  }).passthrough())
}).passthrough();

/** One search call (one Tavily credit at basic depth). */
export async function providerSearch(query: string, options: { excludeDomains?: string[] } = {}): Promise<RawSearchResult[]> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) throw new SearchProviderError("auth", "No search API key is configured.");

  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: query.slice(0, 380), search_depth: "basic", topic: "general", max_results: MAX_RESULTS, include_raw_content: "text", include_answer: false, include_images: false, ...(options.excludeDomains?.length ? { exclude_domains: options.excludeDomains.slice(0, 150) } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store"
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new SearchProviderError(timedOut ? "timeout" : "upstream", timedOut ? "The search provider took too long to answer." : "The search provider could not be reached.");
  }

  if (response.status === 401 || response.status === 403) throw new SearchProviderError("auth", "The search provider rejected the API key.");
  if (response.status === 432 || response.status === 433) throw new SearchProviderError("quota", "The search provider's plan limit has been reached.");
  if (response.status === 429) throw new SearchProviderError("rate", "The search provider is rate limiting requests.");
  if (!response.ok) throw new SearchProviderError("upstream", `The search provider answered with status ${response.status}.`);

  const parsed = responseShape.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new SearchProviderError("bad_response", "The search provider sent a response that could not be read.");
  return parsed.data.results.map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: r.content ?? "",
    rawContent: (r.raw_content ?? "").slice(0, RAW_CONTENT_LIMIT),
    score: r.score ?? 0
  }));
}
