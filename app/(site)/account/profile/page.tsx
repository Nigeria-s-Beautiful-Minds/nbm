import type { Metadata } from "next";
import { ActionForm, Field } from "@/components/ActionForm";
import { updateProfileAction } from "@/lib/actions/account";
import { MEMBER_TYPES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const viewer = await requireViewer("/account/profile");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: viewer.id } });
  return (
    <div>
      <h1>Profile</h1>
      <p className="muted">Your name appears beside what you post. Your email address and phone number are never shown publicly.</p>
      <div className="panel">
        <ActionForm action={updateProfileAction} submitLabel="Save profile" pendingLabel="Saving…">
          <Field name="name" label="Full name" required defaultValue={user.name} autoComplete="name" />
          <Field name="headline" label="Headline" defaultValue={user.headline ?? ""} placeholder="e.g. MSc student in soil science" maxLength={140} />
          <Field name="memberType" label="I am a…" type="select" options={MEMBER_TYPES} defaultValue={user.memberType ?? ""} full={false} />
          <Field name="location" label="City and country" defaultValue={user.location ?? ""} full={false} />
          <Field name="affiliation" label="Institution or organisation" defaultValue={user.affiliation ?? ""} />
          <Field name="interests" label="Interests" defaultValue={user.interests.join(", ")} hint="Separate with commas." />
          <Field name="bio" label="About you" type="textarea" rows={4} defaultValue={user.bio ?? ""} maxLength={1500} />
          <Field name="phone" label="Phone (private)" defaultValue={user.phone ?? ""} hint="Only NBM staff can see this, and only if they need to reach you." autoComplete="tel" />
        </ActionForm>
      </div>
    </div>
  );
}
