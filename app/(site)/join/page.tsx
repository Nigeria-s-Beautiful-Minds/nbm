import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field } from "@/components/ActionForm";
import { joinAction } from "@/lib/actions/auth";
import { MEMBER_TYPES } from "@/lib/constants";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = {
  title: "Join the community",
  description: "Create a free NBM account to share your work, join conversations, find a mentor and support projects."
};

export default async function JoinPage() {
  if (await getViewer()) redirect("/account/workspace");
  return (
    <section className="page-section">
      <div className="shell split">
        <div>
          <div className="logo-panel" style={{ justifyContent: "flex-start" }}><img src="/brand/nbm-logo.png" alt="Nigeria's Beautiful Minds (NBM): people, ideas, opportunities, a brighter Nigeria" width={520} height={534} /></div>
          <p className="kicker">Join NBM</p>
          <h1>Join Nigeria&rsquo;s Beautiful Minds</h1>
          <p className="lede">Membership is free and open to students, researchers, builders and professionals in Nigeria and across the diaspora. You don&rsquo;t need a title or a publication record to take part.</p>
          <ul>
            <li>Share your project in Exhibitions, including early ideas and unfinished prototypes.</li>
            <li>Host or join text conversations and live audio rooms.</li>
            <li>Apply for mentorship, or offer your time as a mentor.</li>
            <li>Request support for a project, or back someone else&rsquo;s.</li>
          </ul>
          <p className="muted small">Your email address is never shown on your public profile. Joining does not add you to our mailing list.</p>
        </div>
        <div className="panel">
          <ActionForm action={joinAction} submitLabel="Create my account" pendingLabel="Creating account…">
            <Field name="name" label="Full name" required autoComplete="name" maxLength={100} />
            <Field name="email" label="Email" type="email" required autoComplete="email" />
            <Field name="password" label="Password" type="password" required minLength={10} autoComplete="new-password" hint="At least 10 characters." />
            <Field name="memberType" label="I am a…" type="select" options={MEMBER_TYPES} full={false} />
            <Field name="location" label="City and country" full={false} placeholder="e.g. Ibadan, Nigeria" maxLength={100} />
            <Field name="consent" type="checkbox" required label="I agree to the terms of use and community standards, and I have read the privacy policy." />
            <p className="full small muted mb-0">Read the <Link href="/terms">terms of use</Link>, <Link href="/community-standards">community standards</Link> and <Link href="/about/privacy">privacy policy</Link>.</p>
          </ActionForm>
          <p className="mt-2 mb-0">Already a member? <Link href="/login">Sign in</Link>.</p>
        </div>
      </div>
    </section>
  );
}
