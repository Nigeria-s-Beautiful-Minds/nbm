import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { apiCapability } from "@/lib/viewer";

// Cells starting with = + - @ are prefixed so a spreadsheet can't run them as formulas.
function cell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// CSV exports for authorised staff only. Every export is recorded in the action history.
export async function GET(request: Request) {
  const { viewer, response } = await apiCapability("operations.manage");
  if (response) return response;
  const type = new URL(request.url).searchParams.get("type");

  let rows: Record<string, unknown>[];
  if (type === "volunteers") rows = await prisma.volunteerApplication.findMany({ orderBy: { createdAt: "desc" }, select: { createdAt: true, name: true, email: true, committee: true, interests: true, skills: true, availability: true, status: true, notes: true } });
  else if (type === "contacts") rows = await prisma.contactRequest.findMany({ orderBy: { createdAt: "desc" }, select: { createdAt: true, name: true, email: true, subject: true, message: true, status: true, notes: true } });
  // Only people who confirmed and haven't unsubscribed.
  else if (type === "subscribers") rows = await prisma.mailingSubscriber.findMany({ where: { status: "ACTIVE" }, orderBy: { consentAt: "desc" }, select: { email: true, name: true, consentAt: true, source: true, policyVersion: true } });
  else return NextResponse.json({ error: "Unknown export." }, { status: 400 });

  await audit(prisma, { actorId: viewer.id, action: "export", targetType: "EXPORT", targetId: type, metadata: { rows: rows.length } });
  const header = rows[0] ? Object.keys(rows[0]) : ["empty"];
  const csv = [header.map(cell).join(","), ...rows.map((row) => header.map((key) => cell(row[key])).join(","))].join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="nbm-${type}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
}
