import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { PageHero } from "@/components/cards";
import { ScholarshipSearchForm } from "@/components/ScholarshipSearchForm";
import { formatDate } from "@/lib/constants";
import { clientIp } from "@/lib/rate-limit";
import { searchProviderStatus } from "@/lib/search-provider";
import { PAGE_SIZE, searchKey, searchScholarships } from "@/lib/scholarships";
import {
  COUNTRY_BY_CODE, EDUCATION_LEVELS, FIELDS, FUNDING_LEVELS, OPPORTUNITY_TYPES, SORTS,
  filtersToQuery, parseFilters, type Opportunity, type ScholarshipFilters, type SortKey
} from "@/lib/scholarships-shared";

export const metadata: Metadata = {
  title: "Scholarships & Funding",
  description: "Discover scholarships, fellowships, and grants that support your education, research, and professional growth."
};

// A live search can take a few seconds when nothing is cached.
export const maxDuration = 30;

const MAX_PAGES = 6;
const SOURCE_LABELS = { official: "Official source", directory: "Directory listing", other: "Source not classified" } as const;
const NOT_SPECIFIED = "Not specified";

type Params = Record<string, string | string[] | undefined>;

export default async function ScholarshipsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const searched = params.search === "1";
  const page = Math.min(MAX_PAGES, Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1));
  const provider = searchProviderStatus();
  const visitor = clientIp(await headers());

  return (
    <div className="accent-funding">
      <PageHero accent="accent-funding" kicker="Opportunities" title="Scholarships & Funding">
        <p className="lede">Discover scholarships, fellowships, and grants that support your education, research, and professional growth.</p>
      </PageHero>

      <section className="page-section tight">
        <div className="shell">
          {!provider.configured && (
            <div className="notice warn" role="note">
              <p><strong>Live search is not switched on yet.</strong> This page is ready, but it is waiting for a search API key to be added to the site&rsquo;s settings. Until then no results can be shown, and none are made up.</p>
            </div>
          )}
          <ScholarshipSearchForm key={filtersToQuery(filters)} initial={filters} />
        </div>
      </section>

      <section className="page-section tight" id="results" aria-label="Search results">
        <div className="shell">
          {searched ? (
            // Keyed on the search itself, so sorting and "Load more" don't flash the loading state.
            <Suspense key={searchKey(filters)} fallback={<ResultsLoading />}>
              <Results filters={filters} page={page} visitor={visitor} />
            </Suspense>
          ) : (
            <div className="empty-state">
              <h2 className="mt-0">Choose your filters, then search</h2>
              <p>Leave any filter on its &ldquo;Any&rdquo; setting to keep the search broad. Results link straight to the page they came from.</p>
            </div>
          )}
          <p className="muted small mt-3">
            Results come from a live web search of university, government, foundation and funder websites, with reputable directories as secondary sources. The search is broad but it does not cover every website, and details are read from each source as it stood on the date shown. Always confirm deadlines, funding and eligibility on the official page before you apply. NBM does not award or administer these opportunities.
          </p>
        </div>
      </section>
    </div>
  );
}

function ResultsLoading() {
  return (
    <div role="status" aria-live="polite">
      <p className="sr-only">Searching for opportunities…</p>
      <div className="results-head"><h2>Searching…</h2></div>
      <ul className="opp-list" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <li key={i}>
            <div className="card opp-card plain"><div className="card-body">
              <div className="skeleton line-sm" /><div className="skeleton line-lg" /><div className="skeleton line" /><div className="skeleton line" /><div className="skeleton line-sm" />
            </div></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Problem({ title, children, retry }: { title: string; children: React.ReactNode; retry?: string }) {
  return (
    <div className="empty-state" role="alert">
      <h2 className="mt-0">{title}</h2>
      {children}
      {retry && <p><Link className="button secondary" href={retry}>Try again</Link></p>}
    </div>
  );
}

async function Results({ filters, page, visitor }: { filters: ScholarshipFilters; page: number; visitor: string }) {
  const outcome = await searchScholarships(filters, visitor);
  const here = `${filtersToQuery(filters)}#results`;

  if (outcome.status === "not_configured") {
    return <Problem title="Search isn’t available yet"><p>The live search is waiting to be connected. Your filters are saved in this page&rsquo;s address, so you can come back to them.</p></Problem>;
  }
  if (outcome.status === "rate_limited") {
    const minutes = Math.max(1, Math.ceil(outcome.retryAfterSeconds / 60));
    return <Problem title="Please wait a moment" retry={here}><p>You&rsquo;ve run several new searches in a short time. Try again in about {minutes} minute{minutes === 1 ? "" : "s"}. Searches you have already run still open straight away.</p></Problem>;
  }
  if (outcome.status === "daily_cap") {
    return <Problem title="Today’s search allowance is used up"><p>New searches are limited each day to keep the service affordable. Searches already run today still open, and new ones will work again tomorrow.</p></Problem>;
  }
  if (outcome.status === "error") {
    const busy = outcome.reason === "timeout" || outcome.reason === "rate";
    return (
      <Problem title="We couldn’t complete that search" retry={here}>
        <p>{busy ? "The search service is busy or slow to answer right now." : outcome.reason === "quota" || outcome.reason === "auth" ? "The search service is not accepting requests from this site at the moment. The team has what it needs to look into it." : "The search service returned an error."} No results are shown rather than guessing. Your filters are unchanged.</p>
      </Problem>
    );
  }

  const shown = outcome.opportunities.slice(0, page * PAGE_SIZE);
  if (outcome.total === 0) {
    return (
      <div className="empty-state" role="status">
        <h2 className="mt-0">No matching opportunities found</h2>
        <p>Nothing from this search matched all of your filters. Try fewer filters, a wider destination or different keywords{filters.includeExpired ? "" : ", or include opportunities whose deadline has passed"}.</p>
        <p className="small">Checked {formatDate(outcome.checkedAt)}. An empty result does not mean no such funding exists.</p>
      </div>
    );
  }

  const sortHref = (sort: SortKey) => `${filtersToQuery({ ...filters, sort })}#results`;
  return (
    <>
      <div className="results-head">
        <div role="status">
          <h2>{outcome.total} opportunit{outcome.total === 1 ? "y" : "ies"} found</h2>
          <p className="muted small">Showing {shown.length} of {outcome.total}. Sources last checked {formatDate(outcome.checkedAt)}.</p>
        </div>
        <nav className="filters" aria-label="Sort results">
          <span className="muted small">Sort by</span>
          {(Object.keys(SORTS) as SortKey[]).map((sort) => (
            <Link key={sort} className={`chip${filters.sort === sort ? " active" : ""}`} href={sortHref(sort)} aria-current={filters.sort === sort ? "true" : undefined} scroll={false}>{SORTS[sort]}</Link>
          ))}
        </nav>
      </div>
      {outcome.partial && <p className="notice warn">Part of this search did not finish, so some sources may be missing. Try again shortly for a fuller list.</p>}
      <ul className="opp-list">
        {shown.map((item) => <li key={item.id}><OpportunityCard item={item} filters={filters} checkedAt={outcome.checkedAt} /></li>)}
      </ul>
      {shown.length < outcome.total && page < MAX_PAGES && (
        <p className="mt-3" style={{ textAlign: "center" }}>
          <Link className="button secondary" href={filtersToQuery(filters, { page: page + 1 })} scroll={false}>Load more ({outcome.total - shown.length} remaining)</Link>
        </p>
      )}
    </>
  );
}

const list = <K extends string>(keys: K[], labels: Record<K, string>) => keys.map((k) => labels[k]).join(", ");

function OpportunityCard({ item, filters, checkedAt }: { item: Opportunity; filters: ScholarshipFilters; checkedAt: string }) {
  const applicant = COUNTRY_BY_CODE.get(filters.nationality)?.name;
  const places = [...item.destinations.map((code) => COUNTRY_BY_CODE.get(code)?.name).filter(Boolean), ...(item.online ? ["Online/Worldwide"] : [])].join(", ");
  const field = item.fields.length ? list(item.fields, FIELDS) : item.allFields ? "All fields" : NOT_SPECIFIED;
  return (
    <article className="card top-accent opp-card">
      <div className="card-body">
        <div className="tags">
          {item.types.length ? item.types.map((t) => <span key={t} className="tag">{OPPORTUNITY_TYPES[t].replace(/s$/, "")}</span>) : <span className="tag neutral">Type not specified</span>}
          <span className={`tag ${item.sourceKind === "official" ? "ok" : item.sourceKind === "directory" ? "warn" : "neutral"}`}>{SOURCE_LABELS[item.sourceKind]}</span>
          {item.expired && <span className="tag danger">Deadline passed</span>}
        </div>
        <h3>{item.title}</h3>
        <p className="opp-org">{item.organisation}</p>
        <dl className="facts">
          <dt>Education level</dt><dd>{item.levels.length ? list(item.levels, EDUCATION_LEVELS) : NOT_SPECIFIED}</dd>
          <dt>Field</dt><dd>{field}</dd>
          <dt>Destination</dt><dd>{places || NOT_SPECIFIED}</dd>
          <dt>Funding</dt><dd>{item.funding ? FUNDING_LEVELS[item.funding] : NOT_SPECIFIED}</dd>
          <dt>Deadline</dt><dd>{item.deadline ? formatDate(item.deadline) : item.rolling ? "Rolling applications" : NOT_SPECIFIED}</dd>
          {applicant && (
            <>
              <dt>Your nationality</dt>
              <dd>{item.nationality === "mentioned" ? `May be open to applicants from ${applicant}: the source mentions it.` : item.nationality === "international" ? `May be open to applicants from ${applicant}: the source refers to international or regional applicants.` : `Not confirmed for applicants from ${applicant}.`} Check the official rules.</dd>
            </>
          )}
        </dl>
        {item.summary && <p>{item.summary}</p>}
        <p className="opp-label">Key eligibility, quoted from the source</p>
        {item.eligibility.length ? (
          <ul className="opp-eligibility">{item.eligibility.map((line) => <li key={line}>{line}</li>)}</ul>
        ) : (
          <p className="small">{NOT_SPECIFIED} in the text we retrieved.</p>
        )}
        {item.unverified.length > 0 && <p className="opp-flag"><strong>Could not be verified:</strong> {item.unverified.join(", ")}. Check the source page.</p>}
        <div className="opp-foot">
          <p className="card-meta">
            <span>Source: <a href={item.url} target="_blank" rel="noopener noreferrer nofollow">{item.host}</a></span>
            <span>Last checked {formatDate(checkedAt)}</span>
          </p>
          <a className="button small" href={item.url} target="_blank" rel="noopener noreferrer nofollow">View opportunity / Apply<span className="sr-only"> for {item.title} (opens in a new tab)</span></a>
        </div>
      </div>
    </article>
  );
}
