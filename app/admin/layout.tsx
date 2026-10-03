import type { Metadata } from "next";
import Link from "next/link";
import { can, type Capability } from "@/lib/permissions";
import { requireStaff } from "@/lib/viewer";

// Staff tools: never indexed, never in the sitemap, and every page re-checks the viewer's role.
export const metadata: Metadata = { title: { default: "Staff tools", template: "%s | NBM staff" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const LINKS: { href: string; label: string; capability: Capability | null }[] = [
  { href: "/admin", label: "Overview", capability: null },
  { href: "/admin/exhibitions", label: "Exhibition review", capability: "exhibitions.review" },
  { href: "/admin/moderation", label: "Reports and discussion", capability: "moderation" },
  { href: "/admin/mentorship", label: "Mentorship", capability: "mentorship.coordinate" },
  { href: "/admin/sponsorship", label: "Sponsorship and finance", capability: "finance.manage" },
  { href: "/admin/operations", label: "Volunteers and contact", capability: "operations.manage" },
  { href: "/admin/email", label: "Email delivery", capability: "operations.manage" },
  { href: "/admin/content", label: "News, team and pages", capability: "content.edit" },
  { href: "/admin/users", label: "Members and roles", capability: "users.manage" },
  { href: "/admin/audit", label: "Action history", capability: "users.manage" },
  { href: "/admin/settings", label: "Settings", capability: "settings.manage" }
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff();
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin">NBM staff tools</Link>
        <nav className="admin-nav" aria-label="Staff tools">
          {LINKS.filter((link) => !link.capability || can(viewer.roles, link.capability)).map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
          <span className="side-label">{viewer.name}</span>
          <Link href="/">Back to the site</Link>
        </nav>
      </aside>
      <main className="admin-main" id="main">{children}</main>
    </div>
  );
}
