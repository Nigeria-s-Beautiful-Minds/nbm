import Link from "next/link";
import { CONTACT_EMAIL, SITE_DESCRIPTOR, SITE_NAME } from "@/lib/constants";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-grid">
          <div>
            <p className="footer-brand">{SITE_NAME}</p>
            <p className="small">{SITE_DESCRIPTOR}</p>
            <p className="small">Show your work. Start a conversation. Build something that matters.</p>
            <p className="small"><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
          </div>
          <nav aria-label="Community">
            <h2>Community</h2>
            <ul>
              <li><Link href="/exhibitions">Exhibitions</Link></li>
              <li><Link href="/discussion">Discussion</Link></li>
              <li><Link href="/mentorship">Mentorship</Link></li>
              <li><Link href="/sponsorship">Sponsorship</Link></li>
            </ul>
          </nav>
          <nav aria-label="About NBM">
            <h2>About</h2>
            <ul>
              <li><Link href="/about">About us</Link></li>
              <li><Link href="/about/news">News</Link></li>
              <li><Link href="/about/team">Our team</Link></li>
              <li><Link href="/get-involved">Get involved</Link></li>
              <li><Link href="/get-involved/contact">Contact us</Link></li>
            </ul>
          </nav>
          <nav aria-label="Policies">
            <h2>Policies</h2>
            <ul>
              <li><Link href="/about/privacy">Privacy Policy</Link></li>
              <li><Link href="/terms">Terms of use</Link></li>
              <li><Link href="/community-standards">Community standards</Link></li>
              <li><Link href="/community-standards#reporting">Report a concern</Link></li>
            </ul>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} {SITE_NAME}.</span>
          <span>Audio rooms are not recorded.</span>
        </div>
      </div>
    </footer>
  );
}
