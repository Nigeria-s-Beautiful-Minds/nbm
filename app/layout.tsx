import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { SITE_DESCRIPTOR, SITE_NAME } from "@/lib/constants";
import { baseUrl, isProductionStage } from "@/lib/config";

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

export const viewport: Viewport = { themeColor: "#064E3B", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        {!isProductionStage && (
          <div className="stage-banner" role="note">Staging preview. Content here is provisional and sample records are labelled.</div>
        )}
        {children}
      </body>
    </html>
  );
}
