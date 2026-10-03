import Link from "next/link";
import { ActionForm, Field } from "@/components/ActionForm";
import { contributeAction } from "@/lib/actions/support";
import { formatMoney } from "@/lib/constants";
import type { PaymentAvailability } from "@/lib/payments";

const SUGGESTED_MINOR = [500_000, 1_000_000, 2_500_000, 5_000_000];

/**
 * The one contribution form, used for the general fund and for campaigns. When payments are
 * not live it says so and points to the enquiry form instead of pretending to take money.
 */
export function ContributeForm({ availability, currency, campaignId, defaultEmail, defaultName }: { availability: PaymentAvailability; currency: string; campaignId?: string; defaultEmail?: string; defaultName?: string }) {
  if (!availability.enabled) {
    return (
      <div className="notice warn">
        <p><strong>Online contributions are not live yet.</strong> We are completing our payment and finance arrangements, and we won&rsquo;t take money until they are in place.</p>
        <p>If you would like to support {campaignId ? "this project" : "NBM"}, <Link href={`/sponsorship/enquiry${campaignId ? `?campaign=${campaignId}` : ""}`}>send a support enquiry</Link> and we&rsquo;ll be in touch.</p>
      </div>
    );
  }
  return (
    <>
      {availability.testMode && <div className="notice warn"><p><strong>Test mode.</strong> This is a development sandbox. No real money moves and no card details are requested.</p></div>}
      <ActionForm action={contributeAction} submitLabel="Continue to secure checkout" pendingLabel="Opening checkout…" buttonClassName="button gold">
        {campaignId && <input type="hidden" name="campaignId" value={campaignId} />}
        <input type="hidden" name="currency" value={currency} />
        <fieldset className="full" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="form-label">Amount ({currency}), one time</legend>
          <div className="amount-options mt-2">
            {SUGGESTED_MINOR.map((minor, index) => (
              <label key={minor}>
                <input type="radio" name="amount" value={String(minor / 100)} defaultChecked={index === 1} />
                <span>{formatMoney(minor, currency)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field name="customAmount" label="Or enter another amount" placeholder="e.g. 7500" full={false} />
        <Field name="email" label="Email for your acknowledgement" type="email" required full={false} defaultValue={defaultEmail} autoComplete="email" />
        <Field name="name" label="Your name" defaultValue={defaultName} autoComplete="name" hint="Only needed if you'd like to be named." />
        <Field name="showPublicly" type="checkbox" label="Show my name publicly as a supporter" hint="Leave unticked to give anonymously. We still keep a private record of the payment." />
        <p className="full small muted mb-0">You&rsquo;ll pay on our payment provider&rsquo;s secure page; NBM never sees or stores card details. You&rsquo;ll get an emailed acknowledgement once the provider confirms the payment. It is not a tax receipt.</p>
      </ActionForm>
    </>
  );
}
