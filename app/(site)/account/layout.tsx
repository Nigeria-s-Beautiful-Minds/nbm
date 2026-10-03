import type { Metadata } from "next";
import { AccountNav } from "@/components/AccountNav";
import { VerifyNotice } from "@/components/VerifyNotice";
import { requireViewer } from "@/lib/viewer";

// Private pages: never indexed, and every one requires a signed-in account.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("/account/workspace");
  return (
    <section className="page-section tight">
      <div className="shell account-layout">
        <AccountNav />
        <div>
          {!viewer.emailVerified && <VerifyNotice what="post, comment or apply" />}
          {children}
        </div>
      </div>
    </section>
  );
}
