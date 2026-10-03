// Scholarships & Funding: filtering, deadlines, duplicates, hostile content, caching, rate limits
// and provider failures, against tests/mock-search-provider.ts. No real search credits are used.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { applyFilters, classifySource, cleanText, deadlineWindow, dedupe, extractDeadline, nationalityMatch, safeUrl, sortOpportunities, toOpportunity } from "../lib/scholarship-extract";
import { searchProviderStatus } from "../lib/search-provider";
import { buildQueries, searchKey, searchScholarships } from "../lib/scholarships";
import { EMPTY_FILTERS, filtersToQuery, parseFilters, type ScholarshipFilters } from "../lib/scholarships-shared";
import { BASE, RUN, api, prisma } from "./helpers";
import { MOCK_KEY, fixtures, startMockProvider, type MockProvider } from "./mock-search-provider";

const PORT = 4598;
const TODAY = new Date();
const saved = { key: process.env.TAVILY_API_KEY, endpoint: process.env.SCHOLARSHIP_SEARCH_ENDPOINT, cap: process.env.SCHOLARSHIP_SEARCH_DAILY_CALLS };
const keys: string[] = [];
let mock: MockProvider;
let visitors = 0;

// Each test searches with its own keyword, so nothing is answered from another test's cache.
const filtersFor = (word: string, extra: Partial<ScholarshipFilters> = {}): ScholarshipFilters => {
  const filters = { ...EMPTY_FILTERS, keywords: `${RUN} ${word}`, ...extra };
  keys.push(searchKey(filters));
  return filters;
};
const visitor = () => `test-${RUN}-${++visitors}`;
const run = async (word: string, extra: Partial<ScholarshipFilters> = {}, who = visitor()) => searchScholarships(filtersFor(word, extra), who);
const ok = async (word: string, extra: Partial<ScholarshipFilters> = {}) => {
  const outcome = await run(word, extra);
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") throw new Error("unreachable");
  return outcome;
};
const titles = (list: { title: string }[]) => list.map((o) => o.title);
const cards = () => dedupe(fixtures().map((r) => toOpportunity({ title: r.title, url: r.url, content: r.content, rawContent: r.raw_content, score: r.score }, { today: TODAY, applicantCountry: "NG" })).filter((o) => o !== null));

before(async () => {
  mock = await startMockProvider(PORT);
  process.env.TAVILY_API_KEY = MOCK_KEY;
  process.env.SCHOLARSHIP_SEARCH_ENDPOINT = `http://127.0.0.1:${PORT}`;
  process.env.SCHOLARSHIP_SEARCH_DAILY_CALLS = "100000";
});
after(async () => {
  await prisma.searchCache.deleteMany({ where: { key: { in: keys } } });
  await mock.close();
  await prisma.$disconnect();
  for (const [name, value] of [["TAVILY_API_KEY", saved.key], ["SCHOLARSHIP_SEARCH_ENDPOINT", saved.endpoint], ["SCHOLARSHIP_SEARCH_DAILY_CALLS", saved.cap]] as const) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

test("filters travel in the address and come back unchanged; unknown values are ignored", () => {
  const filters: ScholarshipFilters = { ...EMPTY_FILTERS, types: ["scholarship", "grant"], levels: ["master"], fields: ["ai-data"], deadlines: ["1m", "rolling"], regions: ["europe"], country: "GB", euOnly: true, nationality: "NG", funding: "full", keywords: "renewable energy", includeExpired: true, sort: "deadline" };
  const params = new URL(filtersToQuery(filters), "http://x").searchParams;
  const back = parseFilters(Object.fromEntries([...new Set(params.keys())].map((k) => [k, params.getAll(k)])));
  assert.deepEqual(back, filters);
  assert.deepEqual(parseFilters({ type: ["scholarship", "bogus"], country: "XX", funding: "free", sort: "random", q: 'site:evil.com "x" <b>' }), { ...EMPTY_FILTERS, types: ["scholarship"], keywords: "site evil.com x b" });
});

test("queries name the chosen filters and never claim more than was asked", () => {
  const [official, broad] = buildQueries({ ...EMPTY_FILTERS, types: ["fellowship"], levels: ["phd"], fields: ["engineering"], country: "DE", nationality: "NG", funding: "full" }, TODAY);
  for (const q of [official, broad]) assert.match(q, /fully funded fellowships PhD Engineering in Germany for students from Nigeria/);
  assert.notEqual(official, broad);
});

test("links: only ordinary web addresses are accepted, and tracking is stripped", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://example.org/x", "https://user:pass@example.org/", "http://localhost/x", "http://127.0.0.1/x", "not a url", ""]) assert.equal(safeUrl(bad), null, bad);
  const a = safeUrl("https://www.Example.edu/Fund/?utm_source=x&b=2&a=1#top");
  assert.equal(a?.host, "example.edu");
  assert.equal(a?.canonical, "example.edu/fund?a=1&b=2");
  assert.equal(cleanText("<script>alert(1)</script>Hello [link](javascript:x) **world**", 100), "alert(1) Hello link world");
});

test("sources: official bodies, directories and everything else are told apart", () => {
  assert.equal(classifySource("ox.ac.uk"), "official");
  assert.equal(classifySource("education.gov.ng"), "official");
  assert.equal(classifySource("daad.de"), "official");
  assert.equal(classifySource("gov.uk"), "official");
  assert.equal(classifySource("scholars4dev.com"), "directory");
  assert.equal(classifySource("bestscholarshipsdaily.com"), "directory");
  assert.equal(toOpportunity({ title: "Scholarship tips", url: "https://www.facebook.com/x", content: "Scholarship", rawContent: "", score: 1 }, { today: TODAY, applicantCountry: "" }), null, "social posts are not sources");
  assert.equal(classifySource("example.com", "Top 10 scholarships for 2027"), "directory");
  assert.equal(classifySource("example.com", "Example Scholarship"), "other");
});

test("deadlines: read only next to a deadline phrase, with a year; the next upcoming one wins", () => {
  const today = new Date("2026-10-03T12:00:00Z");
  assert.deepEqual(extractDeadline("Founded on 4 March 2019. Application deadline: 15 January 2027.", today), { deadline: "2027-01-15", rolling: false, several: false });
  assert.deepEqual(extractDeadline("Applications close on March 1st, 2027", today), { deadline: "2027-03-01", rolling: false, several: false });
  assert.deepEqual(extractDeadline("Deadline: 2026-12-01", today), { deadline: "2026-12-01", rolling: false, several: false });
  assert.equal(extractDeadline("Award A deadline: 1 December 2026. Award B deadline: 1 March 2027.", today).several, true);
  assert.equal(extractDeadline("Applications open on 5 August 2026 and close on 7 November 2026.", today).deadline, "2026-11-07");
  assert.deepEqual(extractDeadline("Last year's deadline: 1 May 2025. Next deadline: 1 May 2027.", today), { deadline: "2027-05-01", rolling: false, several: false });
  assert.deepEqual(extractDeadline("Deadline: 1 May 2025.", today), { deadline: "2025-05-01", rolling: false, several: false });
  assert.equal(extractDeadline("The deadline is 15 January.", today).deadline, null, "no year, so not guessed");
  assert.equal(extractDeadline("Deadline: 31 February 2027", today).deadline, null, "impossible date");
  assert.equal(extractDeadline("The course starts 12 September 2027.", today).deadline, null, "a date that isn't a deadline");
  assert.deepEqual(extractDeadline("Applications are reviewed on a rolling basis.", today), { deadline: null, rolling: true, several: false });
  assert.equal(deadlineWindow("2026-10-20", today), "1m");
  assert.equal(deadlineWindow("2026-11-20", today), "1-2m");
  assert.equal(deadlineWindow("2027-01-20", today), "2-5m");
  assert.equal(deadlineWindow("2027-06-01", today), "5m+");
  assert.equal(deadlineWindow("2026-10-02", today), "past");
});

test("nationality is a hint from the source text, never a guarantee", () => {
  assert.equal(nationalityMatch("Open to Nigerian graduates.", "NG"), "mentioned");
  assert.equal(nationalityMatch("Open to international students.", "NG"), "international");
  assert.equal(nationalityMatch("Open to African researchers.", "NG"), "international");
  assert.equal(nationalityMatch("Open to residents of Niger.", "NG"), "unknown");
  assert.equal(nationalityMatch("A scholarship.", "NG"), "unknown");
});

test("cards: duplicates removed, official source kept, junk and hostile results dropped", () => {
  const list = cards();
  const all = titles(list);
  assert.equal(all.filter((t) => t.includes("Example Global Masters Scholarship")).length, 1, "one card for three copies");
  const masters = list.find((o) => o.title.includes("Example Global Masters Scholarship"))!;
  assert.equal(masters.host, "funding.example.edu");
  assert.equal(masters.sourceKind, "official");
  assert.equal(masters.url, "https://funding.example.edu/masters-scholarship");
  assert.deepEqual([masters.types, masters.levels, masters.funding, masters.destinations, masters.allFields, masters.nationality], [["scholarship"], ["master"], "full", ["GB"], true, "mentioned"]);
  assert.equal(deadlineWindow(masters.deadline!, TODAY), "1m");
  assert.equal(masters.eligibility.length, 3);
  assert.ok(!all.some((t) => t.includes("Campus news")), "a page that isn't funding is dropped");
  assert.ok(!all.some((t) => t.includes("Free scholarship money")), "a javascript: link is dropped");
  assert.ok(list.every((o) => /^https?:\/\//.test(o.url)));

  const hostile = list.find((o) => o.title.includes("Nurses"))!;
  assert.ok(!/[<>]/.test(hostile.title + hostile.summary + hostile.eligibility.join("")), "markup is stripped");
  assert.ok(hostile.unverified.includes("funding coverage"), "text asking to be marked verified changes nothing");

  const bare = list.find((o) => o.title.includes("Undergraduate Bursary"))!;
  assert.equal(bare.deadline, null);
  assert.deepEqual(bare.unverified, ["application deadline", "funding coverage", "eligibility requirements", "funding organisation"]);
  assert.equal(list.find((o) => o.title.includes("Top 10"))!.sourceKind, "directory");
});

test("filtering: type, funding, deadline window, destination, EU-only and expired", () => {
  const list = cards();
  const pick = (extra: Partial<ScholarshipFilters>) => titles(applyFilters(list, { ...EMPTY_FILTERS, ...extra }, TODAY));
  const has = (found: string[], part: string) => found.some((t) => t.includes(part));

  const byDefault = pick({});
  assert.ok(!has(byDefault, "Seed Grant"), "expired is hidden by default");
  assert.ok(has(pick({ includeExpired: true }), "Seed Grant"));

  const fellowships = pick({ types: ["fellowship"] });
  assert.deepEqual(fellowships.filter((t) => !t.includes("Fellowship")), []);
  assert.ok(has(pick({ types: ["fellowship", "grant"] }), "Innovation Grant"));

  assert.ok(!has(pick({ funding: "full" }), "Doctoral Fellowship"), "stated partial funding is excluded from fully funded");
  assert.ok(has(pick({ funding: "full" }), "Undergraduate Bursary"), "unknown funding stays, flagged");
  assert.ok(!has(pick({ funding: "partial" }), "Global Masters"));

  const soon = pick({ deadlines: ["1m"] });
  assert.ok(has(soon, "Global Masters") && !has(soon, "Doctoral Fellowship") && !has(soon, "Online Learning"));
  assert.ok(has(soon, "Undergraduate Bursary"), "no stated deadline stays, flagged");
  assert.ok(has(pick({ deadlines: ["1-2m"] }), "Doctoral Fellowship"));
  assert.ok(has(pick({ deadlines: ["rolling"] }), "Online Learning") && !has(pick({ deadlines: ["rolling"] }), "Global Masters"));
  assert.ok(has(pick({ deadlines: ["5m+"] }), "Innovation Grant"));

  const europe = pick({ regions: ["europe"] });
  assert.ok(has(europe, "Global Masters") && has(europe, "Doctoral Fellowship") && !has(europe, "Innovation Grant") && !has(europe, "Regional Scholarship"));
  assert.ok(has(pick({ country: "GB" }), "Global Masters") && !has(pick({ country: "GB" }), "Doctoral Fellowship"));
  const eu = pick({ euOnly: true });
  assert.ok(has(eu, "Doctoral Fellowship") && !has(eu, "Global Masters"), "the UK is not in the EU");
  assert.ok(has(pick({ regions: ["online"] }), "Online Learning"));
  assert.ok(!has(europe, "Online Learning") && has(pick({ regions: ["europe", "online"] }), "Online Learning"));
  assert.ok(has(pick({ regions: ["africa"] }), "Regional Scholarship A"));
});

test("sorting: official sources lead by relevance; nearest deadline puts dated ones first", () => {
  const list = applyFilters(cards(), { ...EMPTY_FILTERS, includeExpired: true }, TODAY);
  const byRelevance = sortOpportunities(list, "relevance");
  assert.equal(byRelevance[0].sourceKind, "official");
  const kinds = byRelevance.map((o) => o.sourceKind);
  assert.ok(kinds.lastIndexOf("official") < kinds.indexOf("other") && kinds.lastIndexOf("other") < kinds.indexOf("directory"), "official, then other sites, then directories");
  const byDeadline = sortOpportunities(list, "deadline");
  const dated = byDeadline.filter((o) => o.deadline && !o.expired);
  assert.deepEqual(byDeadline.slice(0, dated.length), dated);
  assert.deepEqual(dated.map((o) => o.deadline), [...dated.map((o) => o.deadline)].sort());
  assert.ok(byDeadline[0].title.includes("Global Masters"));
  assert.ok(byDeadline[byDeadline.length - 1].expired, "passed deadlines come last");
});

test("a search returns source-backed cards and is cached: the repeat costs no provider call", async () => {
  const before = mock.calls();
  const first = await ok("cache");
  assert.equal(mock.calls() - before, 2, "two queries for a new search");
  assert.equal(first.cached, false);
  assert.ok(first.total > 10, "enough results to need Load more");
  assert.ok(first.opportunities.every((o) => !o.expired));

  const again = await ok("cache", { sort: "deadline", deadlines: ["1m"], includeExpired: true });
  assert.equal(mock.calls() - before, 2, "sort, deadline and expired changes reuse the cached search");
  assert.equal(again.cached, true);
  assert.equal(again.checkedAt, first.checkedAt);
  const row = await prisma.searchCache.findUnique({ where: { key: keys[keys.length - 1] } });
  assert.equal(row?.providerCalls, 2);
});

test("an empty result is reported as empty, not as an error", async () => {
  const outcome = await ok("nothinghere");
  assert.equal(outcome.total, 0);
});

test("provider failures become clear states, are not cached, and never produce results", async () => {
  for (const [word, reason] of [["failfive", "upstream"], ["ratelimited", "rate"], ["quotaexceeded", "quota"], ["badjson", "bad_response"]] as const) {
    const outcome = await run(word);
    assert.deepEqual(outcome, { status: "error", reason }, word);
    assert.equal(await prisma.searchCache.count({ where: { key: keys[keys.length - 1] } }), 0, `${word} is not cached`);
  }
  process.env.TAVILY_API_KEY = "wrong-key";
  assert.deepEqual(await run("wrongkey"), { status: "error", reason: "auth" });
  process.env.SCHOLARSHIP_SEARCH_ENDPOINT = "http://127.0.0.1:9";
  process.env.TAVILY_API_KEY = MOCK_KEY;
  assert.deepEqual(await run("unreachable"), { status: "error", reason: "upstream" });
  process.env.SCHOLARSHIP_SEARCH_ENDPOINT = `http://127.0.0.1:${PORT}`;
});

test("when one of the two queries fails, the results are shown and marked incomplete", async () => {
  const outcome = await ok("halfbroken");
  assert.equal(outcome.partial, true);
  assert.ok(outcome.total > 0);
});

test("without a key the search reports that it is not configured and calls nothing", async () => {
  const before = mock.calls();
  delete process.env.TAVILY_API_KEY;
  assert.equal(searchProviderStatus().configured, false);
  assert.deepEqual(await run("nokey"), { status: "not_configured" });
  assert.equal(mock.calls(), before);
  process.env.TAVILY_API_KEY = MOCK_KEY;
});

test("rate limit: a visitor's ninth new search in ten minutes is refused; cached ones still open", async () => {
  const who = visitor();
  const before = mock.calls();
  for (let i = 0; i < 8; i++) assert.equal((await run(`limit${i}`, {}, who)).status, "ok");
  const ninth = await run("limit8", {}, who);
  assert.equal(ninth.status, "rate_limited");
  assert.equal(mock.calls() - before, 16, "the refused search reached no provider");
  assert.equal((await run("limit0", {}, who)).status, "ok", "an already cached search is free");
  assert.equal((await run("limit8")).status, "ok", "another visitor is unaffected");
});

test("daily cap: once today's provider calls are spent, new searches wait and cached ones still work", async () => {
  process.env.SCHOLARSHIP_SEARCH_DAILY_CALLS = "1";
  const before = mock.calls();
  assert.deepEqual(await run("capped"), { status: "daily_cap" });
  assert.equal(mock.calls(), before);
  assert.equal((await run("cache")).status, "ok");
  process.env.SCHOLARSHIP_SEARCH_DAILY_CALLS = "100000";
});

test("the page is public, shows the introduction, and never leaks the key", async () => {
  const res = await api(null, "/scholarships");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("Discover scholarships, fellowships, and grants that support your education, research, and professional growth."));
  assert.ok(html.includes("Clear filters"));
  assert.ok(!html.includes("TAVILY") && !(saved.key && html.includes(saved.key)));
  const home = await (await fetch(BASE)).text();
  assert.ok(home.includes('href="/scholarships"'), "the tab is in the navigation");
});
