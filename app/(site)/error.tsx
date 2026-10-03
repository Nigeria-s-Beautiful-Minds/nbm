"use client";

export default function SiteError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="page-section">
      <div className="shell auth-wrap">
        <h1>Something went wrong</h1>
        <p className="status error" role="alert">We couldn&rsquo;t load this page. Nothing you entered elsewhere has been lost.</p>
        <p className="mt-2"><button className="button" type="button" onClick={() => reset()}>Try again</button></p>
      </div>
    </section>
  );
}
