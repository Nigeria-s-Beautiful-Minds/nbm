"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  COUNTRIES, DEADLINE_WINDOWS, EDUCATION_LEVELS, EMPTY_FILTERS, FIELDS, FUNDING_LEVELS, KEYWORDS_MAX, OPPORTUNITY_TYPES, REGIONS,
  filtersToQuery, type ScholarshipFilters
} from "@/lib/scholarships-shared";

type ListKey = "types" | "levels" | "fields" | "deadlines" | "regions";

/**
 * The filter form. Its fields are ordinary inputs in a GET form, so a search is an address:
 * Back, reload and shared links all bring the same filters back, and it works without JavaScript.
 */
export function ScholarshipSearchForm({ initial }: { initial: ScholarshipFilters }) {
  const router = useRouter();
  const [filters, setFilters] = useState(initial);
  const [pending, startTransition] = useTransition();

  const toggle = (key: ListKey, value: string) =>
    setFilters((f) => {
      const list = f[key] as string[];
      return { ...f, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });

  /** A group of tick-boxes shown as chips. Nothing ticked means "any", which the first chip shows. */
  const group = (key: ListKey, param: string, legend: string, anyLabel: string, options: Record<string, string>) => (
    <fieldset className="choice-group full">
      <legend>{legend}</legend>
      <div className="choices">
        <label>
          <input type="checkbox" checked={filters[key].length === 0} onChange={() => setFilters((f) => ({ ...f, [key]: [] }))} />
          <span>{anyLabel}</span>
        </label>
        {Object.entries(options).map(([value, label]) => (
          <label key={value}>
            <input type="checkbox" name={param} value={value} checked={(filters[key] as string[]).includes(value)} onChange={() => toggle(key, value)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <form
      className="panel form-grid funding-form"
      action="/scholarships"
      method="get"
      role="search"
      aria-label="Search scholarships, fellowships and grants"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => router.push(`${filtersToQuery({ ...filters, sort: initial.sort })}#results`));
      }}
    >
      <input type="hidden" name="search" value="1" />
      {group("types", "type", "Opportunity type", "Any type", OPPORTUNITY_TYPES)}
      {group("levels", "level", "Education level", "Any level", EDUCATION_LEVELS)}
      {group("fields", "field", "Field", "All fields", FIELDS)}
      {group("deadlines", "deadline", "Application deadline", "Any deadline", DEADLINE_WINDOWS)}
      {group("regions", "region", "Study destination", "Any destination", REGIONS)}

      <div className="field-wrap">
        <label htmlFor="country">Destination country<span className="optional"> (optional)</span></label>
        <select className="field" id="country" name="country" value={filters.country} onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}>
          <option value="">Any country</option>
          <option value="GB">United Kingdom (UK)</option>
          {COUNTRIES.filter((c) => c.code !== "GB").map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <label className="check-label">
          <input type="checkbox" name="eu" value="1" checked={filters.euOnly} onChange={(e) => setFilters((f) => ({ ...f, euOnly: e.target.checked }))} />
          <span>European Union member states only</span>
        </label>
      </div>

      <div className="field-wrap">
        <label htmlFor="nationality">Your nationality / country of citizenship<span className="optional"> (optional)</span></label>
        <select className="field" id="nationality" name="nationality" aria-describedby="nationality-hint" value={filters.nationality} onChange={(e) => setFilters((f) => ({ ...f, nationality: e.target.value }))}>
          <option value="">Prefer not to say</option>
          <option value="NG">Nigeria</option>
          {COUNTRIES.filter((c) => c.code !== "NG").map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <p className="field-hint" id="nationality-hint">Used only to look for relevant eligibility rules. It is not saved and does not guarantee eligibility.</p>
      </div>

      <fieldset className="choice-group">
        <legend>Funding</legend>
        <div className="choices">
          <label>
            <input type="radio" name="funding" value="" checked={filters.funding === ""} onChange={() => setFilters((f) => ({ ...f, funding: "" }))} />
            <span>Any</span>
          </label>
          {Object.entries(FUNDING_LEVELS).map(([value, label]) => (
            <label key={value}>
              <input type="radio" name="funding" value={value} checked={filters.funding === value} onChange={() => setFilters((f) => ({ ...f, funding: value as ScholarshipFilters["funding"] }))} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field-wrap">
        <label htmlFor="q">Keywords<span className="optional"> (optional)</span></label>
        <input className="field" id="q" name="q" type="text" maxLength={KEYWORDS_MAX} placeholder="e.g. renewable energy, women in STEM" value={filters.keywords} onChange={(e) => setFilters((f) => ({ ...f, keywords: e.target.value }))} />
      </div>

      <label className="check-label full">
        <input type="checkbox" name="expired" value="1" checked={filters.includeExpired} onChange={(e) => setFilters((f) => ({ ...f, includeExpired: e.target.checked }))} />
        <span>Also show opportunities whose stated deadline has passed</span>
      </label>

      <div className="full form-actions">
        <button className="button" type="submit" disabled={pending}>{pending ? "Searching…" : "Search"}</button>
        <button
          className="button ghost"
          type="button"
          onClick={() => {
            setFilters(EMPTY_FILTERS);
            startTransition(() => router.push("/scholarships"));
          }}
        >
          Clear filters
        </button>
      </div>
    </form>
  );
}
