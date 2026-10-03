import type { Metadata } from "next";
import Link from "next/link";
import { ExhibitionCard } from "@/components/cards";
import { listSavedExhibitions } from "@/lib/exhibitions";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Saved items" };

export default async function SavedPage() {
  const viewer = await requireViewer("/account/saved");
  const posts = await listSavedExhibitions(viewer.id);
  return (
    <div>
      <h1>Saved items</h1>
      {posts.length === 0 ? (
        <div className="empty-state"><h3>Nothing saved yet</h3><p>Press Save on any project to keep it here.</p><p><Link className="button" href="/exhibitions">Explore projects</Link></p></div>
      ) : <div className="grid cols-2">{posts.map((post) => <ExhibitionCard key={post.id} post={post} />)}</div>}
    </div>
  );
}
