// Single source of truth for the header, mobile menu and footer. The eight main tabs, in order.
export type NavChild = { href: string; label: string };
export type NavItem = { id: string; href: string; label: string; accent: string; children?: NavChild[]; clickable?: boolean };

export const SITE_NAV: NavItem[] = [
  { id: "home", href: "/", label: "Home", accent: "" },
  {
    id: "about",
    href: "/about",
    label: "About",
    accent: "accent-about",
    children: [
      { href: "/about", label: "About us" },
      { href: "/about/news", label: "News" },
      { href: "/about/team", label: "Our team" },
      { href: "/about/privacy", label: "Privacy Policy" }
    ]
  },
  {
    id: "get-involved",
    href: "/get-involved",
    label: "Get Involved",
    accent: "accent-involved",
    clickable: true,
    children: [
      { href: "/get-involved/contribute", label: "Contribute" },
      { href: "/get-involved/volunteer", label: "Volunteer" },
      { href: "/get-involved/mailing-list", label: "Join our mailing list" },
      { href: "/get-involved/contact", label: "Contact us" }
    ]
  },
  { id: "exhibitions", href: "/exhibitions", label: "Exhibitions", accent: "accent-exhibitions" },
  { id: "discussion", href: "/discussion", label: "Discussion", accent: "accent-discussion" },
  { id: "mentorship", href: "/mentorship", label: "Mentorship", accent: "accent-mentorship" },
  { id: "sponsorship", href: "/sponsorship", label: "Sponsorship", accent: "accent-sponsorship" },
  { id: "scholarships", href: "/scholarships", label: "Scholarships & Funding", accent: "accent-funding" }
];

export const ACCOUNT_NAV: NavChild[] = [
  { href: "/account/workspace", label: "My workspace" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/notifications", label: "Notifications" },
  { href: "/account/saved", label: "Saved items" },
  { href: "/account/settings", label: "Account settings" }
];
