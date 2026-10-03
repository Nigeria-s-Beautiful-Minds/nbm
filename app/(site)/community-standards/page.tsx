import type { Metadata } from "next";
import Link from "next/link";
import { SitePageView } from "@/components/SitePageView";

export const metadata: Metadata = { title: "Community standards", description: "How members of Nigeria's Beautiful Minds treat one another, and how to report a concern." };

export default function CommunityStandardsPage() {
  return (
    <SitePageView slug="community-standards" kicker="Policies" fallbackTitle="Community standards" policy>
      <div className="panel mt-3" id="reporting">
        <h2>Report a concern</h2>
        <p>Use the <strong>Report</strong> button beside any project, comment, message or audio room and it goes straight to our moderators. You must be signed in.</p>
        <p className="mb-0">For anything else, including a concern about a mentoring relationship or how funds are used, <Link href="/get-involved/contact">contact us</Link>.</p>
      </div>
    </SitePageView>
  );
}
