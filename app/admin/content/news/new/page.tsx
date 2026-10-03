import Link from "next/link";
import { NewsForm } from "@/components/admin/NewsForm";
import { requireCapability } from "@/lib/viewer";

export const metadata = { title: "New article" };

export default async function NewNewsPage() {
  await requireCapability("content.edit", "/admin/content");
  return (
    <>
      <p className="breadcrumb"><Link href="/admin/content">News, team and pages</Link> / New article</p>
      <h1>New article</h1>
      <div className="panel"><NewsForm article={null} /></div>
    </>
  );
}
