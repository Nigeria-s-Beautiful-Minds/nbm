import type { Metadata } from "next";
import { SitePageView } from "@/components/SitePageView";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return <SitePageView slug="terms" kicker="Policies" fallbackTitle="Terms of use" policy />;
}
