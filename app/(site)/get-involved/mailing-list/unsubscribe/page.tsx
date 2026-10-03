import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { unsubscribeAction } from "@/lib/actions/involved";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

// A button rather than an automatic unsubscribe on page load, so email scanners that open links can't remove anyone.
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <section className="page-section accent-involved">
      <div className="shell auth-wrap">
        <h1>Unsubscribe</h1>
        <p>Stop receiving mailing-list emails from Nigeria&rsquo;s Beautiful Minds.</p>
        <ActionForm action={unsubscribeAction} submitLabel="Unsubscribe me" hideOnSuccess className="stack">
          <input type="hidden" name="token" value={token ?? ""} />
        </ActionForm>
      </div>
    </section>
  );
}
