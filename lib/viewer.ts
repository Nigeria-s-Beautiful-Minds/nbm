import { cache } from "react";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, isStaff, type Capability } from "@/lib/permissions";
import { initialsFromName } from "@/lib/constants";

export type Viewer = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  emailVerified: boolean;
  initials: string;
  isStaff: boolean;
};

/** Who is making this request, read fresh from the database. Null for visitors and suspended accounts. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, roles: true, emailVerified: true, suspendedAt: true }
  });
  if (!user || user.suspendedAt) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    emailVerified: Boolean(user.emailVerified),
    initials: initialsFromName(user.name),
    isStaff: isStaff(user.roles)
  };
});

/** For pages: sends visitors to sign in and brings them back afterwards. */
export async function requireViewer(returnTo: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
  return viewer;
}

/** For staff pages: a signed-in account without the capability gets a 404, not a hint that the page exists. */
export async function requireCapability(capability: Capability, returnTo = "/admin"): Promise<Viewer> {
  const viewer = await requireViewer(returnTo);
  if (!can(viewer.roles, capability)) notFound();
  return viewer;
}

export async function requireStaff(returnTo = "/admin"): Promise<Viewer> {
  const viewer = await requireViewer(returnTo);
  if (!viewer.isStaff) notFound();
  return viewer;
}

type ApiViewer = { viewer: Viewer; response: null } | { viewer: null; response: NextResponse };

/** For API routes: a signed-in member whose email is verified, or a ready-made error response. */
export async function apiMember(action = "do that"): Promise<ApiViewer> {
  const viewer = await getViewer();
  if (!viewer) return { viewer: null, response: NextResponse.json({ error: `Please sign in to ${action}.` }, { status: 401 }) };
  if (!viewer.emailVerified) {
    return { viewer: null, response: NextResponse.json({ error: `Please verify your email address to ${action}. Check your inbox or request a new link from your account settings.` }, { status: 403 }) };
  }
  return { viewer, response: null };
}

export async function apiCapability(capability: Capability): Promise<ApiViewer> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.roles, capability)) {
    return { viewer: null, response: NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 }) };
  }
  return { viewer, response: null };
}

/** For server actions: throws so a crafted request without the capability can't proceed. */
export async function actionCapability(capability: Capability): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.roles, capability)) throw new Error("Not permitted.");
  return viewer;
}
