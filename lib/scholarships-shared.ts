// Scholarships & Funding: filter options, URL parameters and result types. Dependency-free, so it
// is safe to import from both server code and browser components.

export const OPPORTUNITY_TYPES = { scholarship: "Scholarships", fellowship: "Fellowships", grant: "Grants" } as const;
export const EDUCATION_LEVELS = {
  bachelor: "BSc/Bachelor's",
  master: "MSc/Master's",
  mba: "MBA",
  phd: "PhD",
  postdoc: "Postdoctoral",
  certificate: "Professional Certificates"
} as const;
export const FIELDS = {
  mathematics: "Mathematics",
  engineering: "Engineering",
  "computer-science": "Computer Science",
  "ai-data": "AI & Data Science",
  "natural-sciences": "Natural Sciences",
  medicine: "Medicine & Health",
  business: "Business & Economics",
  "social-sciences": "Social Sciences",
  arts: "Arts & Humanities",
  other: "Other"
} as const;
export const DEADLINE_WINDOWS = {
  "1m": "Within 1 month",
  "1-2m": "1–2 months",
  "2-5m": "2–5 months",
  "5m+": "More than 5 months",
  rolling: "Rolling applications"
} as const;
export const REGIONS = {
  africa: "Africa",
  "north-america": "North America",
  "south-america": "South America",
  europe: "Europe",
  asia: "Asia",
  oceania: "Oceania",
  online: "Online/Worldwide"
} as const;
export const FUNDING_LEVELS = { full: "Fully funded", partial: "Partially funded" } as const;
export const SORTS = { relevance: "Relevance", deadline: "Nearest deadline" } as const;

export type OpportunityType = keyof typeof OPPORTUNITY_TYPES;
export type EducationLevel = keyof typeof EDUCATION_LEVELS;
export type FieldKey = keyof typeof FIELDS;
export type DeadlineWindow = keyof typeof DEADLINE_WINDOWS;
export type RegionKey = keyof typeof REGIONS;
export type FundingLevel = keyof typeof FUNDING_LEVELS;
export type SortKey = keyof typeof SORTS;
type Continent = Exclude<RegionKey, "online">;

// ISO code, name, region. Central America and the Caribbean sit under North America; the Middle
// East under Asia. GB's web addresses end in .uk, which lib/scholarship-extract.ts allows for.
const C = (code: string, name: string, region: Continent) => ({ code, name, region });
export const COUNTRIES = [
  C("AF", "Afghanistan", "asia"), C("AL", "Albania", "europe"), C("DZ", "Algeria", "africa"), C("AD", "Andorra", "europe"), C("AO", "Angola", "africa"),
  C("AG", "Antigua and Barbuda", "north-america"), C("AR", "Argentina", "south-america"), C("AM", "Armenia", "asia"), C("AU", "Australia", "oceania"), C("AT", "Austria", "europe"),
  C("AZ", "Azerbaijan", "asia"), C("BS", "Bahamas", "north-america"), C("BH", "Bahrain", "asia"), C("BD", "Bangladesh", "asia"), C("BB", "Barbados", "north-america"),
  C("BY", "Belarus", "europe"), C("BE", "Belgium", "europe"), C("BZ", "Belize", "north-america"), C("BJ", "Benin", "africa"), C("BT", "Bhutan", "asia"),
  C("BO", "Bolivia", "south-america"), C("BA", "Bosnia and Herzegovina", "europe"), C("BW", "Botswana", "africa"), C("BR", "Brazil", "south-america"), C("BN", "Brunei", "asia"),
  C("BG", "Bulgaria", "europe"), C("BF", "Burkina Faso", "africa"), C("BI", "Burundi", "africa"), C("CV", "Cabo Verde", "africa"), C("KH", "Cambodia", "asia"),
  C("CM", "Cameroon", "africa"), C("CA", "Canada", "north-america"), C("CF", "Central African Republic", "africa"), C("TD", "Chad", "africa"), C("CL", "Chile", "south-america"),
  C("CN", "China", "asia"), C("CO", "Colombia", "south-america"), C("KM", "Comoros", "africa"), C("CG", "Congo", "africa"), C("CD", "Democratic Republic of the Congo", "africa"),
  C("CR", "Costa Rica", "north-america"), C("CI", "Côte d'Ivoire", "africa"), C("HR", "Croatia", "europe"), C("CU", "Cuba", "north-america"), C("CY", "Cyprus", "europe"),
  C("CZ", "Czechia", "europe"), C("DK", "Denmark", "europe"), C("DJ", "Djibouti", "africa"), C("DM", "Dominica", "north-america"), C("DO", "Dominican Republic", "north-america"),
  C("EC", "Ecuador", "south-america"), C("EG", "Egypt", "africa"), C("SV", "El Salvador", "north-america"), C("GQ", "Equatorial Guinea", "africa"), C("ER", "Eritrea", "africa"),
  C("EE", "Estonia", "europe"), C("SZ", "Eswatini", "africa"), C("ET", "Ethiopia", "africa"), C("FJ", "Fiji", "oceania"), C("FI", "Finland", "europe"),
  C("FR", "France", "europe"), C("GA", "Gabon", "africa"), C("GM", "Gambia", "africa"), C("GE", "Georgia", "asia"), C("DE", "Germany", "europe"),
  C("GH", "Ghana", "africa"), C("GR", "Greece", "europe"), C("GD", "Grenada", "north-america"), C("GT", "Guatemala", "north-america"), C("GN", "Guinea", "africa"),
  C("GW", "Guinea-Bissau", "africa"), C("GY", "Guyana", "south-america"), C("HT", "Haiti", "north-america"), C("HN", "Honduras", "north-america"), C("HK", "Hong Kong", "asia"),
  C("HU", "Hungary", "europe"), C("IS", "Iceland", "europe"), C("IN", "India", "asia"), C("ID", "Indonesia", "asia"), C("IR", "Iran", "asia"),
  C("IQ", "Iraq", "asia"), C("IE", "Ireland", "europe"), C("IL", "Israel", "asia"), C("IT", "Italy", "europe"), C("JM", "Jamaica", "north-america"),
  C("JP", "Japan", "asia"), C("JO", "Jordan", "asia"), C("KZ", "Kazakhstan", "asia"), C("KE", "Kenya", "africa"), C("KI", "Kiribati", "oceania"),
  C("KW", "Kuwait", "asia"), C("KG", "Kyrgyzstan", "asia"), C("LA", "Laos", "asia"), C("LV", "Latvia", "europe"), C("LB", "Lebanon", "asia"),
  C("LS", "Lesotho", "africa"), C("LR", "Liberia", "africa"), C("LY", "Libya", "africa"), C("LI", "Liechtenstein", "europe"), C("LT", "Lithuania", "europe"),
  C("LU", "Luxembourg", "europe"), C("MG", "Madagascar", "africa"), C("MW", "Malawi", "africa"), C("MY", "Malaysia", "asia"), C("MV", "Maldives", "asia"),
  C("ML", "Mali", "africa"), C("MT", "Malta", "europe"), C("MH", "Marshall Islands", "oceania"), C("MR", "Mauritania", "africa"), C("MU", "Mauritius", "africa"),
  C("MX", "Mexico", "north-america"), C("FM", "Micronesia", "oceania"), C("MD", "Moldova", "europe"), C("MC", "Monaco", "europe"), C("MN", "Mongolia", "asia"),
  C("ME", "Montenegro", "europe"), C("MA", "Morocco", "africa"), C("MZ", "Mozambique", "africa"), C("MM", "Myanmar", "asia"), C("NA", "Namibia", "africa"),
  C("NR", "Nauru", "oceania"), C("NP", "Nepal", "asia"), C("NL", "Netherlands", "europe"), C("NZ", "New Zealand", "oceania"), C("NI", "Nicaragua", "north-america"),
  C("NE", "Niger", "africa"), C("NG", "Nigeria", "africa"), C("KP", "North Korea", "asia"), C("MK", "North Macedonia", "europe"), C("NO", "Norway", "europe"),
  C("OM", "Oman", "asia"), C("PK", "Pakistan", "asia"), C("PW", "Palau", "oceania"), C("PS", "Palestine", "asia"), C("PA", "Panama", "north-america"),
  C("PG", "Papua New Guinea", "oceania"), C("PY", "Paraguay", "south-america"), C("PE", "Peru", "south-america"), C("PH", "Philippines", "asia"), C("PL", "Poland", "europe"),
  C("PT", "Portugal", "europe"), C("QA", "Qatar", "asia"), C("RO", "Romania", "europe"), C("RU", "Russia", "europe"), C("RW", "Rwanda", "africa"),
  C("KN", "Saint Kitts and Nevis", "north-america"), C("LC", "Saint Lucia", "north-america"), C("VC", "Saint Vincent and the Grenadines", "north-america"), C("WS", "Samoa", "oceania"), C("SM", "San Marino", "europe"),
  C("ST", "São Tomé and Príncipe", "africa"), C("SA", "Saudi Arabia", "asia"), C("SN", "Senegal", "africa"), C("RS", "Serbia", "europe"), C("SC", "Seychelles", "africa"),
  C("SL", "Sierra Leone", "africa"), C("SG", "Singapore", "asia"), C("SK", "Slovakia", "europe"), C("SI", "Slovenia", "europe"), C("SB", "Solomon Islands", "oceania"),
  C("SO", "Somalia", "africa"), C("ZA", "South Africa", "africa"), C("KR", "South Korea", "asia"), C("SS", "South Sudan", "africa"), C("ES", "Spain", "europe"),
  C("LK", "Sri Lanka", "asia"), C("SD", "Sudan", "africa"), C("SR", "Suriname", "south-america"), C("SE", "Sweden", "europe"), C("CH", "Switzerland", "europe"),
  C("SY", "Syria", "asia"), C("TW", "Taiwan", "asia"), C("TJ", "Tajikistan", "asia"), C("TZ", "Tanzania", "africa"), C("TH", "Thailand", "asia"),
  C("TL", "Timor-Leste", "asia"), C("TG", "Togo", "africa"), C("TO", "Tonga", "oceania"), C("TT", "Trinidad and Tobago", "north-america"), C("TN", "Tunisia", "africa"),
  C("TR", "Türkiye", "asia"), C("TM", "Turkmenistan", "asia"), C("TV", "Tuvalu", "oceania"), C("UG", "Uganda", "africa"), C("UA", "Ukraine", "europe"),
  C("AE", "United Arab Emirates", "asia"), C("GB", "United Kingdom", "europe"), C("US", "United States", "north-america"), C("UY", "Uruguay", "south-america"), C("UZ", "Uzbekistan", "asia"),
  C("VU", "Vanuatu", "oceania"), C("VE", "Venezuela", "south-america"), C("VN", "Vietnam", "asia"), C("YE", "Yemen", "asia"), C("ZM", "Zambia", "africa"),
  C("ZW", "Zimbabwe", "africa")
] as const;

export const COUNTRY_BY_CODE: ReadonlyMap<string, { code: string; name: string; region: Continent }> = new Map(COUNTRIES.map((c) => [c.code, c]));
export const EU_MEMBERS: ReadonlySet<string> = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);

export type ScholarshipFilters = {
  types: OpportunityType[];
  levels: EducationLevel[];
  fields: FieldKey[];
  deadlines: DeadlineWindow[];
  regions: RegionKey[];
  /** Destination country (ISO code) or "". */
  country: string;
  euOnly: boolean;
  /** Applicant's country of citizenship (ISO code) or "". */
  nationality: string;
  funding: FundingLevel | "";
  keywords: string;
  includeExpired: boolean;
  sort: SortKey;
};

export const EMPTY_FILTERS: ScholarshipFilters = { types: [], levels: [], fields: [], deadlines: [], regions: [], country: "", euOnly: false, nationality: "", funding: "", keywords: "", includeExpired: false, sort: "relevance" };

export const KEYWORDS_MAX = 80;

/** Letters, digits and light punctuation only: no quotes or search operators reach the provider. */
export function cleanKeywords(raw: string): string {
  return raw.normalize("NFKC").replace(/[^\p{L}\p{N}\s&+'’.-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, KEYWORDS_MAX);
}

type Params = Record<string, string | string[] | undefined>;
const many = (value: string | string[] | undefined): string[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const one = (value: string | string[] | undefined): string => many(value)[0] ?? "";
const pick = <K extends string>(values: string[], options: Record<K, string>): K[] => [...new Set(values)].filter((v): v is K => v in options);

/** Reads filters from the page's query string, ignoring anything that isn't a known option. */
export function parseFilters(params: Params): ScholarshipFilters {
  const country = one(params.country).toUpperCase();
  const nationality = one(params.nationality).toUpperCase();
  const funding = one(params.funding);
  const sort = one(params.sort);
  return {
    types: pick(many(params.type), OPPORTUNITY_TYPES),
    levels: pick(many(params.level), EDUCATION_LEVELS),
    fields: pick(many(params.field), FIELDS),
    deadlines: pick(many(params.deadline), DEADLINE_WINDOWS),
    regions: pick(many(params.region), REGIONS),
    country: COUNTRY_BY_CODE.has(country) ? country : "",
    euOnly: one(params.eu) === "1",
    nationality: COUNTRY_BY_CODE.has(nationality) ? nationality : "",
    funding: funding in FUNDING_LEVELS ? (funding as FundingLevel) : "",
    keywords: cleanKeywords(one(params.q)),
    includeExpired: one(params.expired) === "1",
    sort: sort in SORTS ? (sort as SortKey) : "relevance"
  };
}

/** The address of a search: filters live in the URL, so Back and shared links restore them. */
export function filtersToQuery(filters: ScholarshipFilters, extra: { page?: number } = {}): string {
  const q = new URLSearchParams({ search: "1" });
  filters.types.forEach((v) => q.append("type", v));
  filters.levels.forEach((v) => q.append("level", v));
  filters.fields.forEach((v) => q.append("field", v));
  filters.deadlines.forEach((v) => q.append("deadline", v));
  filters.regions.forEach((v) => q.append("region", v));
  if (filters.country) q.set("country", filters.country);
  if (filters.euOnly) q.set("eu", "1");
  if (filters.nationality) q.set("nationality", filters.nationality);
  if (filters.funding) q.set("funding", filters.funding);
  if (filters.keywords) q.set("q", filters.keywords);
  if (filters.includeExpired) q.set("expired", "1");
  if (filters.sort !== "relevance") q.set("sort", filters.sort);
  if (extra.page && extra.page > 1) q.set("page", String(extra.page));
  return `/scholarships?${q}`;
}

export type SourceKind = "official" | "directory" | "other";
export type NationalityMatch = "mentioned" | "international" | "unknown";

/** One opportunity as shown on the page. Every value comes from the retrieved source text. */
export type Opportunity = {
  id: string;
  title: string;
  url: string;
  host: string;
  organisation: string;
  sourceKind: SourceKind;
  types: OpportunityType[];
  levels: EducationLevel[];
  fields: FieldKey[];
  allFields: boolean;
  /** Destination country codes found in the title, summary or web address. */
  destinations: string[];
  online: boolean;
  funding: FundingLevel | null;
  /** ISO date (yyyy-mm-dd) as stated by the source, or null. */
  deadline: string | null;
  rolling: boolean;
  expired: boolean;
  summary: string;
  /** Sentences quoted from the source. */
  eligibility: string[];
  nationality: NationalityMatch;
  /** Details the source text did not state, shown as "could not be verified". */
  unverified: string[];
  score: number;
};
