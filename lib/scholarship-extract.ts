// Turns raw web-search results into opportunity cards. Everything here is deterministic text
// matching over what the provider returned: nothing is generated, so a detail the source text does
// not state stays empty and is shown as "Not specified". Retrieved text is untrusted: it is
// reduced to plain text, links are checked, and nothing in it is ever followed or executed.
import {
  COUNTRIES, COUNTRY_BY_CODE, EU_MEMBERS,
  type DeadlineWindow, type EducationLevel, type FieldKey, type FundingLevel, type NationalityMatch,
  type Opportunity, type OpportunityType, type ScholarshipFilters, type SortKey, type SourceKind
} from "@/lib/scholarships-shared";

export type RawSearchResult = { title: string; url: string; content: string; rawContent: string; score: number };

const DAY_MS = 86_400_000;
const RAW_TEXT_LIMIT = 20_000;

/** Plain text only: tags, markdown markup and control characters are removed. */
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  const text = input
    .slice(0, max * 4)
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, "")
    .replace(/[*_`#>]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_|ref$|source$|igshid$|msclkid$)/i;

/** Accepts only ordinary public web links; returns the tidied address and its host. */
export function safeUrl(raw: unknown): { url: string; host: string; canonical: string } | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  let parsed: URL;
  try { parsed = new URL(raw.trim()); } catch { return null; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  for (const key of [...parsed.searchParams.keys()]) if (TRACKING_PARAM.test(key)) parsed.searchParams.delete(key);
  parsed.hash = "";
  parsed.searchParams.sort();
  const path = parsed.pathname.replace(/\/+$/, "");
  const query = parsed.searchParams.toString();
  return { url: parsed.toString(), host, canonical: `${host}${path.toLowerCase()}${query ? `?${query}` : ""}` };
}

// ── Source classification ──
// Official: the body that awards or administers the funding. Directories list other people's
// opportunities and are kept as secondary sources.
const OFFICIAL_HOST = [/\.edu$/, /\.edu\.[a-z]{2}$/, /\.ac\.[a-z]{2}$/, /(^|\.)gov$/, /(^|\.)gov\.[a-z]{2}$/, /(^|\.)gouv\.[a-z]{2}$/, /\.go\.[a-z]{2}$/, /(^|\.)gc\.ca$/, /(^|\.)europa\.eu$/, /\.int$/, /(^|[.-])(uni|univ|university|universiteit|universitet|universidad|universite)([.-]|$)/];
const OFFICIAL_DOMAINS = ["chevening.org", "daad.de", "fulbrightprogram.org", "cscuk.fcdo.gov.uk", "mastercardfdn.org", "gatescambridge.org", "rhodeshouse.ox.ac.uk", "wellcome.org", "ukri.org", "nsf.gov", "nih.gov", "campusfrance.org", "studyinsweden.se", "si.se", "nuffic.nl", "studyinholland.nl", "britishcouncil.org", "worldbank.org", "afdb.org", "au.int", "unesco.org", "who.int", "un.org", "aims.ac.za", "erasmus-plus.ec.europa.eu", "humboldt-foundation.de", "schwarzmanscholars.org", "knight-hennessy.stanford.edu", "tetfund.gov.ng", "ptdf.gov.ng", "aauw.org", "rotary.org", "opensocietyfoundations.org", "fordfoundation.org", "gatesfoundation.org", "tonyelumelufoundation.org", "carnegie.org", "macfound.org", "snf.ch", "dfg.de", "jsps.go.jp", "studyinjapan.go.jp", "csc.edu.cn", "studyinkorea.go.kr", "australiaawards.gov.au", "educanada.ca", "vliruos.be", "ares-ac.be", "eacea.ec.europa.eu"];
const DIRECTORY_DOMAINS = ["scholarshipportal.com", "mastersportal.com", "phdportal.com", "bachelorsportal.com", "opportunitiesforafricans.com", "scholars4dev.com", "afterschoolafrica.com", "opportunitydesk.org", "scholarshipdb.net", "findaphd.com", "findamasters.com", "scholarshipregion.com", "youthop.com", "scholarshiproar.com", "wemakescholars.com", "internationalscholarships.com", "scholarships.com", "fastweb.com", "bold.org", "topuniversities.com", "timeshighereducation.com", "studyportals.com", "opportunitiescorners.com", "scholarshipair.com", "myschoolgist.com", "fundsforngos.org", "armacad.info", "mladiinfo.eu", "heysuccess.com", "advance-africa.com", "estudyassistant.com", "greatyop.com"];
// Social and question sites are not sources for an opportunity; their results are dropped.
export const EXCLUDED_DOMAINS = ["facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com", "youtube.com", "youtu.be", "reddit.com", "quora.com", "linkedin.com", "medium.com", "pinterest.com", "threads.net", "t.me", "whatsapp.com", "wikipedia.org"];
/** Known directories and social sites, left out of the query aimed at official pages. */
export const SECONDARY_DOMAINS = [...DIRECTORY_DOMAINS, ...EXCLUDED_DOMAINS];
// Sites named after scholarships or opportunities in general are aggregators, not funders.
const DIRECTORY_HOST = /scholarship|opportunit|bursar|grants?and|studyabroad|afterschool|fundsfor/;
const LIST_TITLE = /\b(?:top|best|latest)\s+\d{1,3}\b|^\s*\d{1,3}\+?\s+\S|\blist of\b|\bscholarships? (?:list|database|directory)\b/i;

const onDomain = (host: string, domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));

export function classifySource(host: string, title = ""): SourceKind {
  if (onDomain(host, DIRECTORY_DOMAINS)) return "directory";
  if (onDomain(host, OFFICIAL_DOMAINS) || OFFICIAL_HOST.some((re) => re.test(host))) return LIST_TITLE.test(title) ? "other" : "official";
  return LIST_TITLE.test(title) || DIRECTORY_HOST.test(host) ? "directory" : "other";
}

// ── Type, level, field, funding ──
const TYPE_PATTERNS: [OpportunityType, RegExp][] = [
  ["scholarship", /\b(?:scholarships?|bursar(?:y|ies)|studentships?|tuition (?:waiver|award)s?)\b/i],
  ["fellowship", /\b(?:fellowships?|fellows program(?:me)?)\b/i],
  ["grant", /\b(?:grants?|research funding|seed funding|funding call|call for proposals)\b/i]
];
const LEVEL_PATTERNS: [EducationLevel, RegExp][] = [
  ["postdoc", /\bpost-?\s?doc(?:toral|s)?\b/i],
  ["bachelor", /\b(?:undergraduates?|bachelor(?:'|’)?s?|b\.?sc|first degree)\b/i],
  ["master", /\b(?:master(?:'|’)?s?|m\.?sc|mphil|llm|m\.?eng|postgraduate taught|graduate (?:study|studies|degree|students?))\b/i],
  ["mba", /\bmba\b/i],
  ["phd", /\b(?:ph\.?d|doctoral|doctorate|dphil)\b/i],
  ["certificate", /\b(?:professional certificat(?:e|es|ion)|certificate (?:course|program(?:me)?)|short courses?|executive education|professional diploma)\b/i]
];
const FIELD_PATTERNS: [FieldKey, RegExp][] = [
  ["mathematics", /\b(?:mathematics|mathematical|maths?|statistics)\b/i],
  ["engineering", /\bengineering\b/i],
  ["computer-science", /\b(?:computer science|computing|software|informatics|cybersecurity|information technology)\b/i],
  ["ai-data", /\b(?:artificial intelligence|machine learning|data science|\bAI\b|data analytics)\b/i],
  ["natural-sciences", /\b(?:physics|chemistry|biology|natural sciences?|life sciences?|earth sciences?|environmental science|geology|astronomy)\b/i],
  ["medicine", /\b(?:medicine|medical|public health|global health|nursing|pharmacy|biomedical|health sciences?|dentistry)\b/i],
  ["business", /\b(?:business|economics|finance|management|accounting|entrepreneurship|mba)\b/i],
  ["social-sciences", /\b(?:social sciences?|sociology|political science|international relations|public policy|development studies|psychology|law|education)\b/i],
  ["arts", /\b(?:arts|humanities|history|literature|philosophy|languages?|music|design|creative writing|journalism)\b/i]
];
const ALL_FIELDS = /\b(?:all|any) (?:fields?|disciplines?|subjects?|courses|programmes|programs|areas? of study)\b|\bany (?:academic )?discipline\b/i;
const FULL_FUNDING = /\bfully[- ]funded\b|\bfull(?:y)?[- ](?:tuition|scholarships?|funding|ride|cost)\b|\bcovers? (?:the )?(?:full|all) (?:tuition|costs|fees)\b/i;
const PARTIAL_FUNDING = /\bpartial(?:ly)?[- ](?:funded|funding|scholarships?|tuition)\b|\bpart[- ]funded\b|\btuition (?:discount|reduction)\b|\b\d{1,2}\s?% (?:of )?(?:the )?(?:tuition|fees?)\b|\bcontribution towards\b/i;
const ONLINE = /\b(?:online (?:course|degree|program(?:me)?|masters?|learning|study)|distance learning|fully online|study online|worldwide|any country|anywhere in the world)\b/i;

const matchAll = <K extends string>(text: string, patterns: [K, RegExp][]): K[] => patterns.filter(([, re]) => re.test(text)).map(([key]) => key);

export function detectTypes(title: string, body: string): { types: OpportunityType[]; fromTitle: boolean } {
  const inTitle = matchAll(title, TYPE_PATTERNS);
  if (inTitle.length) return { types: inTitle, fromTitle: true };
  return { types: matchAll(body, TYPE_PATTERNS), fromTitle: false };
}

export function detectLevels(text: string): EducationLevel[] {
  // "post-doctoral" must not also count as doctoral.
  const withoutPostdoc = text.replace(/post-?\s?doc(?:toral|s)?/gi, " ");
  return LEVEL_PATTERNS.filter(([key, re]) => re.test(key === "postdoc" ? text : withoutPostdoc)).map(([key]) => key);
}

export function detectFunding(text: string): FundingLevel | null {
  const full = FULL_FUNDING.test(text);
  const partial = PARTIAL_FUNDING.test(text);
  return full === partial ? null : full ? "full" : "partial";
}

// ── Deadlines ──
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DEADLINE_CUE = /\b(?:deadlines?|closing dates?|clos(?:es?|ed|ing) (?:on|at|by)|applications? (?:will )?close[sd]?|apply (?:by|before|until)|open until|due (?:date|by|on)|submit(?:ted)? (?:by|before)|applications? (?:are |is )?due|last date|no later than|must be received by)\b/gi;
const DATE_FORMS: [RegExp, (m: RegExpExecArray) => [number, number, number]][] = [
  [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${MONTH}\\.?,?\\s+(\\d{4})\\b`, "gi"), (m) => [Number(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[1])]],
  [new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"), (m) => [Number(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], Number(m[2])]],
  [/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => [Number(m[1]), Number(m[2]), Number(m[3])]]
];
const ROLLING = /\brolling (?:basis|admissions?|applications?|deadline)\b|\bno (?:fixed |set )?(?:application )?deadline\b|\b(?:accepted|open|reviewed) (?:all|throughout the) year\b|\b(?:open|accepted) year[- ]round\b|\bon a rolling\b/i;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Dates count as deadlines only when they follow a deadline phrase and carry a year. With several,
 * the next upcoming one is used; if every stated deadline has passed, the latest marks it expired.
 */
export function extractDeadline(text: string, today: Date): { deadline: string | null; rolling: boolean; several: boolean } {
  const found = new Set<string>();
  const maxYear = today.getUTCFullYear() + 3;
  for (const cue of text.matchAll(DEADLINE_CUE)) {
    const window = text.slice(cue.index, cue.index + 140);
    for (const [re, read] of DATE_FORMS) {
      re.lastIndex = 0;
      for (let m = re.exec(window); m; m = re.exec(window)) {
        const [year, month, day] = read(m);
        if (year < 2000 || year > maxYear || !month || month > 12 || day < 1 || day > 31) continue;
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCMonth() === month - 1) found.add(isoDay(date));
      }
    }
  }
  const dates = [...found].sort();
  const now = isoDay(today);
  const upcoming = dates.find((d) => d >= now);
  // Several upcoming dates usually means a page that lists more than one award.
  return { deadline: upcoming ?? dates[dates.length - 1] ?? null, rolling: ROLLING.test(text), several: dates.filter((d) => d >= now).length > 1 };
}

export function deadlineWindow(deadline: string, today: Date): DeadlineWindow | "past" {
  const days = Math.round((Date.parse(deadline) - Date.parse(isoDay(today))) / DAY_MS);
  if (days < 0) return "past";
  if (days <= 31) return "1m";
  if (days <= 61) return "1-2m";
  if (days <= 152) return "2-5m";
  return "5m+";
}

// ── Destination and nationality ──
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ALIASES: Record<string, string[]> = {
  GB: ["UK", "U.K.", "Britain", "England", "Scotland", "Wales"], US: ["USA", "U.S.A.", "U.S.", "United States of America"], KR: ["Korea"], CZ: ["Czech Republic"], TR: ["Turkey"],
  AE: ["UAE"], NL: ["Holland", "the Netherlands"], CI: ["Ivory Coast", "Cote d'Ivoire"], CD: ["DR Congo", "DRC"], RU: ["Russian Federation"]
};
// Longest names first, so "Papua New Guinea" is claimed before "Guinea" can match inside it.
const COUNTRY_NAMES = COUNTRIES.flatMap((c) => [c.name, ...(ALIASES[c.code] ?? [])].map((name) => ({ code: c.code, name }))).sort((a, b) => b.name.length - a.name.length)
  .map(({ code, name }) => ({ code, re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, /^[A-Z.]+$/.test(name) ? "gu" : "giu") }));
const ORIGIN_CUE = /(?:from|citizens? of|nationals? of|residents? of|students? of|born in|domiciled in|countries (?:like|such as|including))\s+(?:the\s+)?$/i;
// Country-code endings that are mostly used as generic web addresses.
const GENERIC_TLDS = new Set(["io", "co", "ai", "me", "tv", "cc", "fm", "ly", "to", "eu", "gg", "so", "sh", "ws", "la", "st", "nu"]);

export function detectDestinations(text: string, host: string, sourceKind: SourceKind, applicantCountry = ""): string[] {
  const found: string[] = [];
  let remaining = text;
  for (const { code, re } of COUNTRY_NAMES) {
    re.lastIndex = 0;
    let studyPlace = false;
    remaining = remaining.replace(re, (match, offset: number) => {
      if (!ORIGIN_CUE.test(remaining.slice(Math.max(0, offset - 40), offset))) studyPlace = true;
      return " ".repeat(match.length);
    });
    if (studyPlace && !found.includes(code)) found.push(code);
  }
  // An official body's web address says where it is based (ox.ac.uk, daad.de). That is firmer than
  // country names in the text, which on such pages are often the list of eligible home countries.
  const tld = host.split(".").pop() ?? "";
  if (sourceKind === "official" && tld.length === 2 && !GENERIC_TLDS.has(tld)) {
    const code = tld === "uk" ? "GB" : tld.toUpperCase();
    if (COUNTRY_BY_CODE.has(code)) return [code];
  }
  // "…for Nigerian students in Germany": the applicant's own country is rarely the destination.
  const withoutHome = found.filter((code) => code !== applicantCountry);
  return (withoutHome.length ? withoutHome : found).slice(0, 4);
}

const DEMONYMS: Record<string, string> = {
  NG: "Nigerian", GH: "Ghanaian", KE: "Kenyan", ZA: "South African", EG: "Egyptian", ET: "Ethiopian", UG: "Ugandan", TZ: "Tanzanian", RW: "Rwandan", CM: "Cameroonian", SN: "Senegalese", ZM: "Zambian", ZW: "Zimbabwean",
  IN: "Indian", PK: "Pakistani", BD: "Bangladeshi", CN: "Chinese", ID: "Indonesian", PH: "Filipino", VN: "Vietnamese", BR: "Brazilian", MX: "Mexican", US: "American", GB: "British", CA: "Canadian", DE: "German", FR: "French", TR: "Turkish"
};
const REGION_TERMS: Record<string, RegExp> = {
  africa: /\b(?:africans?|sub-saharan)\b/i, asia: /\basians?\b/i, europe: /\beuropeans?\b/i, "south-america": /\blatin american?s?\b/i, "north-america": /\bnorth americans?\b/i, oceania: /\bpacific island(?:er)?s?\b/i
};
const INTERNATIONAL = /\b(?:international (?:students?|applicants?|candidates?|scholars?)|all nationalities|any nationality|any country|all countries|developing countr(?:y|ies)|low- and middle-income|commonwealth|worldwide|overseas students?)\b/i;

/** Whether the source text mentions the applicant's country or a wider group that includes it. Never proof of eligibility. */
export function nationalityMatch(text: string, code: string): NationalityMatch {
  const country = COUNTRY_BY_CODE.get(code);
  if (!country) return "unknown";
  const names = [country.name, ...(ALIASES[code] ?? []), ...(DEMONYMS[code] ? [DEMONYMS[code]] : [])];
  if (names.some((name) => new RegExp(`(?<![\\p{L}])${escapeRe(name)}s?(?![\\p{L}])`, "iu").test(text))) return "mentioned";
  if (REGION_TERMS[country.region]?.test(text) || INTERNATIONAL.test(text)) return "international";
  return "unknown";
}

// ── Eligibility, organisation ──
const ELIGIBILITY_CUE = /\b(?:eligib\w+|applicants? (?:must|should|need|are required)|candidates? (?:must|should)|must (?:be|have|hold)|open to|citizens? of|nationals? of|who can apply|minimum (?:gpa|cgpa|grade)|requirements?)\b/i;

export function extractEligibility(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    const s = sentence.trim();
    if (s.length < 40 || s.length > 320 || !ELIGIBILITY_CUE.test(s)) continue;
    const key = s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s.length > 240 ? `${s.slice(0, 239).trimEnd()}…` : s);
    if (out.length === 3) break;
  }
  return out;
}

const TITLE_SPLIT = /\s+[|–—·]\s+|\s+-\s+/;

function organisationFrom(title: string, host: string, kind: SourceKind): string {
  if (kind === "directory") return `Listed on ${host} (funder not confirmed)`;
  const parts = title.split(TITLE_SPLIT).map((p) => p.trim()).filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  if (last && last.length <= 70 && !/^(?:home|apply|scholarships?|funding|\d{4})/i.test(last)) return last;
  return host;
}

function shortHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

const OPPORTUNITY_WORDS = /\b(?:scholarships?|fellowships?|grants?|bursar(?:y|ies)|studentships?|funding|awards?|stipends?)\b/i;

/** One raw result becomes one card, or null when it isn't a usable funding page. */
export function toOpportunity(raw: RawSearchResult, context: { today: Date; applicantCountry: string }): Opportunity | null {
  const link = safeUrl(raw.url);
  const title = cleanText(raw.title, 160);
  if (!link || !title || onDomain(link.host, EXCLUDED_DOMAINS)) return null;
  const summary = cleanText(raw.content, 360).replace(/\n/g, " ").replace(/^Title:\s*/i, "").replace(/\s*\|[\s|]*/g, " ").trim();
  // Table cells become separate lines, so a row is never quoted as if it were a sentence.
  const body = cleanText(raw.rawContent, RAW_TEXT_LIMIT).replace(/[ \t]*\|[ \t|-]*/g, "\n");
  const headline = `${title}. ${summary}`;
  const everything = `${headline}\n${body}`;
  if (!OPPORTUNITY_WORDS.test(headline)) return null;

  const sourceKind = classifySource(link.host, title);
  const { types } = detectTypes(title, summary);
  const levelsNear = detectLevels(headline);
  const levels = levelsNear.length ? levelsNear : detectLevels(body.slice(0, 4000));
  const fields = matchAll(headline, FIELD_PATTERNS);
  const allFields = ALL_FIELDS.test(everything);
  const funding = detectFunding(headline) ?? detectFunding(body);
  const { deadline, rolling, several } = extractDeadline(everything, context.today);
  const destinations = detectDestinations(headline, link.host, sourceKind, context.applicantCountry);
  const online = ONLINE.test(headline);
  const eligibility = extractEligibility(`${summary}\n${body}`);

  const unverified: string[] = [];
  if (!deadline && !rolling) unverified.push("application deadline");
  else if (several) unverified.push("which deadline applies (the page states several; the next one is shown)");
  if (!funding) unverified.push("funding coverage");
  if (!levels.length) unverified.push("education level");
  if (!destinations.length && !online) unverified.push("destination");
  if (!eligibility.length) unverified.push("eligibility requirements");
  if (sourceKind !== "official") unverified.push("funding organisation");

  return {
    id: shortHash(link.canonical), title, url: link.url, host: link.host,
    organisation: organisationFrom(title, link.host, sourceKind), sourceKind,
    types, levels, fields, allFields, destinations, online, funding,
    deadline, rolling: rolling && !deadline,
    expired: deadline ? deadline < isoDay(context.today) : false,
    summary, eligibility,
    nationality: nationalityMatch(everything, context.applicantCountry),
    unverified,
    score: Number.isFinite(raw.score) ? Math.max(0, Math.min(1, raw.score)) : 0
  };
}

// ── Duplicates, filters, order ──
const KIND_RANK: Record<SourceKind, number> = { official: 2, other: 1, directory: 0 };
const titleKey = (title: string) => title.split(TITLE_SPLIT)[0].toLowerCase().replace(/\b20\d\d(?:\s?[/–-]\s?(?:20)?\d\d)?\b/g, "").replace(/[^a-z0-9]+/g, "");
const better = (a: Opportunity, b: Opportunity) => KIND_RANK[a.sourceKind] - KIND_RANK[b.sourceKind] || Number(Boolean(a.deadline)) - Number(Boolean(b.deadline)) || a.score - b.score;

/** The same page, or the same opportunity on two sites, is shown once: official source first. */
export function dedupe(list: Opportunity[]): Opportunity[] {
  const byKey = new Map<string, Opportunity>();
  const keyOf = new Map<string, string>();
  for (const item of list) {
    const tKey = titleKey(item.title);
    const keys = [`u:${item.id}`, ...(tKey.length >= 12 ? [`t:${tKey}`] : [])];
    const existingKey = keys.map((k) => keyOf.get(k)).find(Boolean);
    const slot = existingKey ?? keys[0];
    const current = byKey.get(slot);
    if (!current || better(item, current) > 0) byKey.set(slot, item);
    for (const k of keys) keyOf.set(k, slot);
  }
  return [...byKey.values()];
}

function destinationAllowed(code: string, filters: ScholarshipFilters): boolean {
  const country = COUNTRY_BY_CODE.get(code);
  if (!country) return false;
  if (filters.euOnly && !EU_MEMBERS.has(code)) return false;
  if (filters.country) return code === filters.country;
  const continents = filters.regions.filter((r) => r !== "online");
  return continents.length === 0 || continents.includes(country.region);
}

/**
 * Applies the filters that can be checked against a card. A card is removed only when its own
 * stated details contradict a filter; one whose details are unknown stays, flagged as unverified.
 */
export function applyFilters(list: Opportunity[], filters: ScholarshipFilters, today: Date): Opportunity[] {
  const now = isoDay(today);
  const wantsPlace = Boolean(filters.country || filters.euOnly || filters.regions.length);
  const placeOnly = filters.country || filters.euOnly || filters.regions.some((r) => r !== "online");
  return list
    .map((item) => ({ ...item, expired: item.deadline ? item.deadline < now : false }))
    .filter((item) => {
      if (item.expired && !filters.includeExpired) return false;
      if (filters.types.length && item.types.length && !item.types.some((t) => filters.types.includes(t))) return false;
      if (filters.funding && item.funding && item.funding !== filters.funding) return false;
      if (filters.deadlines.length) {
        if (item.deadline) {
          const window = deadlineWindow(item.deadline, today);
          if (window !== "past" && !filters.deadlines.includes(window)) return false;
        } else if (item.rolling && !filters.deadlines.includes("rolling")) return false;
      }
      if (wantsPlace && item.destinations.length) {
        if (!item.destinations.some((code) => destinationAllowed(code, filters))) return false;
      } else if (wantsPlace && item.online && placeOnly && !filters.regions.includes("online")) return false;
      return true;
    });
}

// Official pages always come before other sites, and directories last; the provider's score orders each group.
const relevance = (item: Opportunity) => KIND_RANK[item.sourceKind] + item.score / 2;

export function sortOpportunities(list: Opportunity[], sort: SortKey): Opportunity[] {
  const byRelevance = (a: Opportunity, b: Opportunity) => relevance(b) - relevance(a) || a.title.localeCompare(b.title);
  if (sort !== "deadline") return [...list].sort(byRelevance);
  // Dated first (soonest at the top), then rolling, then those with no stated deadline.
  const group = (item: Opportunity) => (item.deadline && !item.expired ? 0 : item.rolling ? 1 : item.deadline ? 3 : 2);
  return [...list].sort((a, b) => group(a) - group(b) || (a.deadline && b.deadline ? a.deadline.localeCompare(b.deadline) : 0) || byRelevance(a, b));
}
