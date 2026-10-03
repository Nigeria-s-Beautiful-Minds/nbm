import Link from "next/link";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/viewer";
import { ROLE_LABELS, type RoleName } from "@/lib/permissions";

export default async function AdminOverview() {
  const viewer = await requireStaff();
  const cards: { href: string; label: string; value: number }[] = [];
  // Each count is loaded only for staff who can act on it.
  if (can(viewer.roles, "exhibitions.review")) {
    cards.push({ href: "/admin/exhibitions", label: "Exhibitions awaiting review", value: await prisma.exhibition.count({ where: { OR: [{ status: "PENDING" }, { status: "APPROVED", revisionStatus: "PENDING" }] } }) });
  }
  if (can(viewer.roles, "moderation")) cards.push({ href: "/admin/moderation", label: "Open reports", value: await prisma.report.count({ where: { status: "OPEN" } }) });
  if (can(viewer.roles, "mentorship.coordinate")) {
    cards.push({ href: "/admin/mentorship", label: "Mentors to verify", value: await prisma.mentorProfile.count({ where: { status: "PENDING" } }) });
    cards.push({ href: "/admin/mentorship", label: "Applications to match", value: await prisma.mentorshipApplication.count({ where: { status: { in: ["SUBMITTED", "REVIEWING"] } } }) });
  }
  if (can(viewer.roles, "finance.manage")) {
    cards.push({ href: "/admin/sponsorship", label: "Support requests to review", value: await prisma.campaign.count({ where: { status: { in: ["SUBMITTED", "REVIEWING"] } } }) });
    cards.push({ href: "/admin/sponsorship", label: "New support enquiries", value: await prisma.supportEnquiry.count({ where: { status: "NEW" } }) });
  }
  if (can(viewer.roles, "operations.manage")) {
    cards.push({ href: "/admin/operations", label: "Volunteer applications", value: await prisma.volunteerApplication.count({ where: { status: "SUBMITTED" } }) });
    cards.push({ href: "/admin/operations", label: "New contact requests", value: await prisma.contactRequest.count({ where: { status: "NEW" } }) });
    cards.push({ href: "/admin/email", label: "Emails not delivered", value: await prisma.emailOutbox.count({ where: { status: { in: ["QUEUED", "FAILED"] } } }) });
  }

  return (
    <>
      <h1>Overview</h1>
      <p className="muted">Signed in as {viewer.name}. Your roles: {viewer.roles.map((role) => ROLE_LABELS[role as RoleName]).join(", ")}.</p>
      <div className="stat-grid mt-2">
        {cards.map((card) => <Link key={card.label} href={card.href} className="stat"><strong>{card.value}</strong><span>{card.label}</span></Link>)}
      </div>
      {cards.length === 0 && <p className="status mt-2">There is nothing waiting for your roles right now.</p>}
    </>
  );
}
