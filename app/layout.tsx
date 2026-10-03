import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { SITE_DESCRIPTOR, SITE_NAME } from "@/lib/constants";
import { baseUrl, isProductionStage } from "@/lib/config";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap", weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl()),
  title: { default: `${SITE_NAME} (NBM)`, template: `%s | ${SITE_NAME}` },
  description: `${SITE_DESCRIPTOR} Connecting Nigerian researchers, innovators, students and professionals at home and abroad.`,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    images: [{ url: "/brand/nbm-share.jpg", width: 1200, height: 675, alt: "A world map with connections from Nigerians around the globe linking back to Nigeria." }]
  },
  twitter: { card: "summary_large_image" },
  // Staging must never be indexed; production pages opt in through app/robots.ts.
  robots: isProductionStage ? undefined : { index: false, follow: false }
};

export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#FAFCFA" }, { media: "(prefers-color-scheme: dark)", color: "#0B1511" }], width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the theme script sets data-theme on <html> before React loads.
    <html lang="en" className={`${inter.variable} ${manrope.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
