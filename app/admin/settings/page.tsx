import { ActionForm, Field } from "@/components/ActionForm";
import { saveSettingsAction } from "@/lib/actions/admin";
import { getCommittees, getLimits, getSetting, optimaisRelationshipConfirmed } from "@/lib/config";
import { livekitConfigured } from "@/lib/livekit";
import { emailConfigured } from "@/lib/mailer";
import { configuredProvider } from "@/lib/payments";
import { storageDriver } from "@/lib/storage";
import { requireCapability } from "@/lib/viewer";

export const metadata = { title: "Settings" };

const LIMIT_LABELS: Record<string, string> = {
  imageMaxMb: "Photo size limit (MB)", imagesPerPost: "Photos per post", videoMaxMb: "Video size limit (MB)", videoMaxSeconds: "Video length limit (seconds)",
  documentMaxMb: "Application document limit (MB)", roomMaxParticipants: "People per audio room", roomMaxSpeakers: "Speakers per audio room", hostGraceSeconds: "Host-away grace period (seconds)"
};

export default async function AdminSettingsPage() {
  await requireCapability("settings.manage", "/admin/settings");
  const [limits, committees, relationship, paymentsLive] = await Promise.all([getLimits(), getCommittees(), optimaisRelationshipConfirmed(), getSetting<boolean>("paymentsLiveConfirmed", false)]);
  const storage = storageDriver();
  // Names of what is connected only. No keys or secrets are ever read into a page.
  const services = [
    ["Email delivery", emailConfigured() ? "Configured" : "Not configured: messages queue but don't send"],
    ["Media storage", storage === "r2" ? "Cloudflare R2" : storage === "local" ? "Local disk (development only)" : "Not configured: uploads are unavailable"],
    ["Live audio", livekitConfigured() ? "LiveKit configured" : "Not configured: rooms can't be started"],
    ["Payments", configuredProvider() === "none" ? "Not configured" : configuredProvider() === "devsandbox" ? "Development sandbox (no real money)" : "Paystack key present"]
  ];
  return (
    <>
      <h1>Settings</h1>
      <h2 className="mt-3">Connected services</h2>
      <dl className="facts">{services.map(([name, state]) => (<div key={name} style={{ display: "contents" }}><dt>{name}</dt><dd>{state}</dd></div>))}</dl>

      <div className="panel mt-3">
        <ActionForm action={saveSettingsAction} submitLabel="Save settings" pendingLabel="Saving…">
          <h2 className="full mb-0">Pilot limits</h2>
          {Object.entries(LIMIT_LABELS).map(([key, label]) => <Field key={key} name={key} label={label} type="number" min={1} required full={false} defaultValue={String(limits[key as keyof typeof limits])} />)}
          <h2 className="full mb-0">Volunteer committees</h2>
          <Field name="committees" label="One per line" type="textarea" rows={5} required defaultValue={committees.join("\n")} />
          <h2 className="full mb-0">Founder confirmations</h2>
          <Field name="optimaisRelationshipConfirmed" type="checkbox" label="The founder has confirmed that NBM is an initiative of Optimais Labs (shows that line on About)" defaultValue={relationship ? "on" : ""} />
          <Field name="paymentsLiveConfirmed" type="checkbox" label="The founder has confirmed the receiving account, provider eligibility, currencies, refund rules and finance owner (allows real contributions once a provider key is set)" defaultValue={paymentsLive ? "on" : ""} />
        </ActionForm>
      </div>
    </>
  );
}
