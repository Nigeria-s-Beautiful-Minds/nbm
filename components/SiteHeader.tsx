"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { ACCOUNT_NAV, SITE_NAV, type NavItem } from "@/lib/site-nav";
import { ThemeToggle } from "@/components/ThemeToggle";

type HeaderViewer = { name: string; initials: string; isStaff: boolean; unread: number } | null;

const Caret = () => (
  <svg className="caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** The NBM emblem from the founder's logo (images/NBM_logo.png, prepared by scripts/prepare-brand.mjs). */
export function BrandMark() {
  return <img className="brand-emblem" src="/brand/nbm-emblem.png" alt="" width={44} height={43} />;
}

export function SiteHeader({ viewer }: { viewer: HeaderViewer }) {
  const pathname = usePathname();
  // Which desktop dropdown is open ("about", "get-involved", "account") and which mobile submenu.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSub, setMobileSub] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  const isActive = (item: NavItem) => (item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`));

  // Navigating closes everything.
  useEffect(() => { setOpenMenu(null); setMobileOpen(false); }, [pathname]);

  // Dropdowns work by click, touch and keyboard, never hover alone: Escape and outside clicks close them.
  useEffect(() => {
    if (!openMenu && !mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const trigger = headerRef.current?.querySelector<HTMLElement>(`[data-menu="${openMenu ?? "mobile"}"]`);
      setOpenMenu(null);
      setMobileOpen(false);
      trigger?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onPointer); };
  }, [openMenu, mobileOpen]);

  const toggle = (id: string) => setOpenMenu((current) => (current === id ? null : id));

  return (
    <header className="site-header" ref={headerRef}>
      <div className="shell nav">
        <Link className="brand" href="/" aria-label="Nigeria's Beautiful Minds, home">
          <BrandMark />
          <span className="brand-text"><span className="brand-name">NBM</span><span className="brand-sub">Nigeria&rsquo;s Beautiful Minds</span></span>
        </Link>

        <nav className="nav-links" aria-label="Main">
          {SITE_NAV.map((item) => {
            const active = isActive(item);
            if (!item.children) {
              return (
                <div className="nav-item" key={item.id}>
                  <Link href={item.href} className={`nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>{item.label}</Link>
                </div>
              );
            }
            const open = openMenu === item.id;
            return (
              <div className="nav-item" key={item.id}>
                {item.clickable ? (
                  <>
                    <Link href={item.href} className={`nav-link${active ? " active" : ""}`} aria-current={pathname === item.href ? "page" : undefined}>{item.label}</Link>
                    <button type="button" className="nav-trigger nav-caret" data-menu={item.id} aria-expanded={open} aria-controls={`menu-${item.id}`} aria-label={`${item.label} menu`} onClick={() => toggle(item.id)}>
                      <Caret />
                    </button>
                  </>
                ) : (
                  <button type="button" className={`nav-trigger${active ? " active" : ""}`} data-menu={item.id} aria-expanded={open} aria-controls={`menu-${item.id}`} onClick={() => toggle(item.id)}>
                    {item.label} <Caret />
                  </button>
                )}
                {open && (
                  <ul className="dropdown" id={`menu-${item.id}`}>
                    {item.children.map((child) => (
                      <li key={child.href}><Link href={child.href} aria-current={pathname === child.href ? "page" : undefined}>{child.label}</Link></li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="nav-actions">
          <ThemeToggle />
          {viewer ? (
            <div className="nav-item">
              <button type="button" className="avatar" data-menu="account" aria-expanded={openMenu === "account"} aria-controls="menu-account" aria-label={`Account menu for ${viewer.name}${viewer.unread ? `, ${viewer.unread} unread notifications` : ""}`} onClick={() => toggle("account")}>
                {viewer.initials}
                {viewer.unread > 0 && <span className="avatar-dot" aria-hidden="true" />}
              </button>
              {openMenu === "account" && (
                <ul className="dropdown right" id="menu-account">
                  <li className="dropdown-note">Signed in as {viewer.name}</li>
                  {ACCOUNT_NAV.map((link) => (
                    <li key={link.href}><Link href={link.href}>{link.label}{link.href === "/account/notifications" && viewer.unread > 0 ? ` (${viewer.unread})` : ""}</Link></li>
                  ))}
                  {viewer.isStaff && <li><Link href="/admin">Staff tools</Link></li>}
                  <li><hr /></li>
                  <li><button type="button" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button></li>
                </ul>
              )}
            </div>
          ) : (
            <>
              <Link className="nav-link desktop-only" href="/login">Sign in</Link>
              <Link className="button desktop-only" href="/join">Join NBM</Link>
            </>
          )}
          <button type="button" className="hamburger" data-menu="mobile" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} aria-controls="mobile-nav" onClick={() => setMobileOpen((o) => !o)}>
            <span /><span /><span />
          </button>
        </div>
      </div>

      <nav id="mobile-nav" className={`mobile-nav${mobileOpen ? " open" : ""}`} aria-label="Main, mobile">
        {SITE_NAV.map((item) => {
          const active = isActive(item);
          if (!item.children) {
            return <Link key={item.id} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>{item.label}</Link>;
          }
          const open = mobileSub === item.id;
          return (
            <div key={item.id}>
              {item.clickable ? (
                <div className="mobile-row">
                  <Link href={item.href} className={active ? "active" : ""}>{item.label}</Link>
                  <button type="button" className="mobile-sub-toggle" aria-expanded={open} aria-controls={`mobile-sub-${item.id}`} aria-label={`${item.label} submenu`} onClick={() => setMobileSub(open ? null : item.id)}><Caret /></button>
                </div>
              ) : (
                <button type="button" className="mobile-sub-toggle" aria-expanded={open} aria-controls={`mobile-sub-${item.id}`} onClick={() => setMobileSub(open ? null : item.id)}>
                  {item.label} <Caret />
                </button>
              )}
              {open && (
                <div className="mobile-sub" id={`mobile-sub-${item.id}`}>
                  {item.children.map((child) => <Link key={child.href} href={child.href}>{child.label}</Link>)}
                </div>
              )}
            </div>
          );
        })}
        {!viewer && (
          <div className="mobile-nav-actions">
            <Link className="button secondary" href="/login">Sign in</Link>
            <Link className="button" href="/join">Join NBM</Link>
          </div>
        )}
      </nav>
    </header>
  );
}
