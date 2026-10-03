import Link from "next/link";
import { formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/viewer";

export const metadata = { title: "News, team and pages" };

const PAGES = [["about", "About us"], ["privacy", "Privacy Policy"], ["terms", "Terms of use"], ["community-standards", "Community standards"]];

export default async function AdminContentPage() {
  await requireCapability("content.edit", "/admin/content");
  const [news, team, versions] = await Promise.all([
    prisma.newsArticle.findMany({ orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, slug: true, title: true, status: true, category: true, updatedAt: true } }),
    prisma.teamMember.findMany({ orderBy: [{ group: "asc" }, { sortOrder: "asc" }] }),
    prisma.pageVersion.findMany({ orderBy: { version: "desc" }, select: { slug: true, version: true, status: true, effectiveDate: true } })
  ]);
  return (
    <>
      <h1>News, team and pages</h1>

      <div className="row spread mt-3"><h2 className="mb-0">News</h2><Link className="button small" href="/admin/content/news/new">New article</Link></div>
      <div className="table-wrap mt-2">
        <table className="table">
          <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            {news.length === 0 && <tr><td colSpan={5}>No articles yet.</td></tr>}
            {news.map((a) => (
              <tr key={a.id}>
                <td>{a.title}</td><td>{a.category}</td><td>{a.status.toLowerCase()}</td><td>{formatDate(a.updatedAt)}</td>
                <td><Link href={`/admin/content/news/${a.id}`}>Edit</Link> · <Link href={`/about/news/${a.slug}`}>{a.status === "PUBLISHED" ? "View" : "Preview"}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row spread mt-3"><h2 className="mb-0">Team</h2><Link className="button small" href="/admin/content/team/new">Add person</Link></div>
      <p className="muted small">Only list real people who have approved their details. Unpublished profiles are not shown publicly.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Role</th><th>Group</th><th>Public</th><th></th></tr></thead>
          <tbody>
            {team.length === 0 && <tr><td colSpan={5}>Nobody added yet. The public team page shows an honest &ldquo;coming soon&rdquo; message.</td></tr>}
            {team.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.roleTitle}</td><td>{p.group.toLowerCase()}</td><td>{p.published ? "Yes" : "No"}</td><td><Link href={`/admin/content/team/${p.id}`}>Edit</Link></td></tr>)}
          </tbody>
        </table>
      </div>

      <h2 className="mt-3">Pages and policies</h2>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Page</th><th>Published version</th><th>Draft</th><th></th></tr></thead>
          <tbody>
            {PAGES.map(([slug, label]) => {
              const published = versions.find((v) => v.slug === slug && v.status === "PUBLISHED");
              const draft = versions.find((v) => v.slug === slug && v.status === "DRAFT");
              return (
                <tr key={slug}>
                  <td>{label}</td>
                  <td>{published ? `v${published.version}${published.effectiveDate ? `, effective ${formatDate(published.effectiveDate)}` : ""}` : "None"}</td>
                  <td>{draft ? `v${draft.version}` : "—"}</td>
                  <td><Link href={`/admin/content/pages/${slug}`}>Edit</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
