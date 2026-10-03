import Link from "next/link";
import { notFound } from "next/navigation";
import { NewsForm } from "@/components/admin/NewsForm";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/viewer";

export const metadata = { title: "Edit article" };

export default async function EditNewsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireCapability("content.edit", "/admin/content");
  const { id } = await params;
  const article = await prisma.newsArticle.findUnique({ where: { id }, include: { linkedExhibition: { select: { slug: true } } } });
  if (!article) notFound();
  return (
    <>
      <p className="breadcrumb"><Link href="/admin/content">News, team and pages</Link> / Edit article</p>
      <h1>Edit article</h1>
      {(await searchParams).saved === "1" && <p className="status success" role="status">Saved.</p>}
      <p><Link href={`/about/news/${article.slug}`}>{article.status === "PUBLISHED" ? "View on the site" : "Preview (editors only)"}</Link></p>
      <div className="panel"><NewsForm article={article} /></div>
    </>
  );
}
