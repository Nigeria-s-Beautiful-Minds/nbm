import type { Metadata } from "next";
import Link from "next/link";
import { SitePageView } from "@/components/SitePageView";

export const metadata: Metadata = { title: "Privacy Policy", description: "How Nigeria's Beautiful Minds collects, uses and protects personal data." };

export default function PrivacyPage() {
  return (
    <SitePageView slug="privacy" kicker="About" fallbackTitle="Privacy Policy" policy>
      <p className="mt-3">Questions or requests about your data? <Link href="/get-involved/contact">Contact us</Link>.</p>
    </SitePageView>
  );
}
