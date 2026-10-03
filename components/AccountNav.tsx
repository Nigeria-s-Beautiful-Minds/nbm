"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ACCOUNT_NAV } from "@/lib/site-nav";

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav className="side-nav" aria-label="Account">
      <span className="side-label">My account</span>
      {ACCOUNT_NAV.map((link) => (
        <Link key={link.href} href={link.href} className={pathname.startsWith(link.href) ? "active" : ""} aria-current={pathname === link.href ? "page" : undefined}>{link.label}</Link>
      ))}
    </nav>
  );
}
