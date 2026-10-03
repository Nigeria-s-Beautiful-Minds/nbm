import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prose } from "@/components/Prose";
import { formatDate } from "@/lib/constants";
import { coverUrl, getNewsArticle } from "@/lib/content";
import { can } from "@/lib/permissions";
import { getViewer } from "@/lib/viewer";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  // Built as a visitor: a draft never leaks its title or excerpt into metadata.
  const article = await getNewsArticle(slug, false);
  if (!article) return { title: "News", robots: { index: false } };
  return { title: article.title, description: article.excerpt, openGraph: { title: article.title, description: article.excerpt, type: "article", ...(article.coverUploadId ? { images: [{ url: coverUrl(article.coverUploadId)!, alt: article.coverAlt ?? "" }] } : {}) } };
}

export default async function NewsArticlePage({ params }: Params) {
  const { slug } = await params;
  const viewer = await getViewer();
  const article = await getNewsArticle(slug, can(viewer?.roles, "content.edit"));
  if (!article) notFound();

  return (
    <section className="page-section tight accent-about">
      <div className="shell narrow">
        <p className="breadcrumb"><Link href="/about/news">News</Link> / {article.category}</p>
        {article.status !== "PUBLISHED" && <div className="notice warn"><p><strong>Preview.</strong> This article is {article.status.toLowerCase()} and only visible to editors.</p></div>}
        <h1>{article.title}</h1>
        <p className="muted">{article.author?.name ?? "NBM team"}{article.publishedAt ? ` · ${formatDate(article.publishedAt)}` : ""}</p>
        {article.coverUploadId && <img src={coverUrl(article.coverUploadId)!} alt={article.coverAlt ?? ""} style={{ borderRadius: 16, marginBottom: 24 }} />}
        <Prose source={article.body} />
        {article.linkedExhibition?.status === "APPROVED" && (
          <div className="notice accent-exhibitions mt-3"><p>Related project: <Link href={`/exhibitions/${article.linkedExhibition.slug}`}>{article.linkedExhibition.title}</Link></p></div>
        )}
      </div>
    </section>
  );
}
