import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field } from "@/components/ActionForm";
import { ImageUploadField } from "@/components/ImageUploadField";
import { deleteTeamMemberAction, saveTeamMemberAction } from "@/lib/actions/admin";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/viewer";

export const metadata = { title: "Team member" };

export default async function TeamMemberPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("content.edit", "/admin/content");
  const { id } = await params;
  const person = id === "new" ? null : await prisma.teamMember.findUnique({ where: { id } });
  if (id !== "new" && !person) notFound();
  return (
    <>
      <p className="breadcrumb"><Link href="/admin/content">News, team and pages</Link> / Team</p>
      <h1>{person ? "Edit team member" : "Add team member"}</h1>
      <div className="panel">
        <ActionForm action={saveTeamMemberAction} submitLabel="Save" pendingLabel="Saving…">
          {person && <input type="hidden" name="id" value={person.id} />}
          <Field name="name" label="Name" required full={false} defaultValue={person?.name} />
          <Field name="roleTitle" label="Role" required full={false} defaultValue={person?.roleTitle} />
          <Field name="group" label="Group" type="select" required full={false} defaultValue={person?.group ?? "STAFF"} options={[{ value: "STAFF", label: "Team" }, { value: "ADVISER", label: "Adviser" }, { value: "COMMITTEE", label: "Organising committee" }]} />
          <Field name="sortOrder" label="Order on the page" type="number" min={0} full={false} defaultValue={String(person?.sortOrder ?? 0)} />
          <Field name="bio" label="Short biography" type="textarea" rows={4} required defaultValue={person?.bio} />
          <ImageUploadField name="photoUploadId" purpose="TEAM_PHOTO" label="Photograph" initialUploadId={person?.photoUploadId ?? null} />
          <Field name="published" type="checkbox" label="Show on the public team page" defaultValue={person?.published ? "on" : ""} />
          <Field name="confirmed" type="checkbox" label="This person has approved their name, role, photograph and biography" hint="Required to publish. Never add invented people or affiliations." />
        </ActionForm>
      </div>
      {person && (
        <div className="mt-2">
          <ActionForm action={deleteTeamMemberAction} submitLabel="Delete this profile" className="stack" buttonClassName="button small danger" confirm="Delete this profile?">
            <input type="hidden" name="id" value={person.id} />
          </ActionForm>
        </div>
      )}
    </>
  );
}
