import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getViewer } from "@/lib/viewer";
import { prisma } from "@/lib/prisma";

// Shared chrome for every public and member page. Reads the session, so it renders per request.
export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const unread = viewer ? await prisma.notification.count({ where: { userId: viewer.id, readAt: null } }).catch(() => 0) : 0;
  return (
    <>
      <SiteHeader viewer={viewer ? { name: viewer.name, initials: viewer.initials, isStaff: viewer.isStaff, unread } : null} />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
