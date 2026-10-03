import Link from "next/link";
import { PageHero } from "@/components/cards";
import { Prose } from "@/components/Prose";
import { formatDate } from "@/lib/constants";
import { getSitePage } from "@/lib/pages";

/** Renders an editable page (about, privacy, terms, community standards) from its latest version. */
export async function SitePageView({ slug, kicker, fallbackTitle, accent = "accent-about", policy = false, children }: { slug: string; kicker: string; fallbackTitle: string; accent?: string; policy?: boolean; children?: React.ReactNode }) {
  const page = await getSitePage(slug);
  return (
    <div className={accent}>
      <PageHero accent={accent} kicker={kicker} title={page?.title ?? fallbackTitle}>
        {policy && page && (
          <p className="muted">Version {page.version}{page.effectiveDate ? ` · Effective ${formatDate(page.effectiveDate)}` : ""}</p>
        )}
      </PageHero>
      <section className="page-section tight">
        <div className="shell">
          {page?.isDraft && (
            <div className="notice warn"><p><strong>Draft, not yet approved.</strong> This text is provisional and is shown on the staging site only. It must be reviewed and approved by the founder before launch.</p></div>
          )}
          {page ? <Prose source={page.body} /> : (
            <div className="empty-state">
              <h3>This page is being finalised</h3>
              <p>It will be published here before launch. If you have a question in the meantime, please <Link href="/get-involved/contact">contact us</Link>.</p>
            </div>
          )}
          {children}
        </div>
      </section>
    </div>
  );
}
