// Dependency-free permission map, shared by the server checks and the UI (which only uses it to
// decide what to show; every action re-checks on the server).

export type RoleName = "MEMBER" | "EDITOR" | "MODERATOR" | "COORDINATOR" | "FINANCE" | "ADMIN";

export type Capability =
  | "content.edit" // news, team, pages
  | "exhibitions.review" // approve, reject, remove member posts
  | "exhibitions.publishDirect" // own posts skip review
  | "moderation" // reports, discussion and audio interventions
  | "mentorship.coordinate" // mentor verification, opportunities, applications, matches
  | "finance.manage" // campaigns, contributions, disbursements, support enquiries
  | "operations.manage" // volunteers, contact requests, mailing list, email queue
  | "settings.manage"
  | "users.manage"; // assign roles, suspend accounts

const MATRIX: Record<Capability, RoleName[]> = {
  "content.edit": ["EDITOR", "ADMIN"],
  "exhibitions.review": ["MODERATOR", "ADMIN"],
  "exhibitions.publishDirect": ["EDITOR", "ADMIN"],
  moderation: ["MODERATOR", "ADMIN"],
  "mentorship.coordinate": ["COORDINATOR", "ADMIN"],
  "finance.manage": ["FINANCE", "ADMIN"],
  "operations.manage": ["COORDINATOR", "ADMIN"],
  "settings.manage": ["ADMIN"],
  "users.manage": ["ADMIN"]
};

export const STAFF_ROLES: RoleName[] = ["EDITOR", "MODERATOR", "COORDINATOR", "FINANCE", "ADMIN"];

export const ROLE_LABELS: Record<RoleName, string> = {
  MEMBER: "Member",
  EDITOR: "Editor",
  MODERATOR: "Moderator",
  COORDINATOR: "Coordinator",
  FINANCE: "Finance",
  ADMIN: "Administrator"
};

export function can(roles: readonly string[] | undefined, capability: Capability): boolean {
  if (!roles) return false;
  return MATRIX[capability].some((role) => roles.includes(role));
}

export function isStaff(roles: readonly string[] | undefined): boolean {
  return Boolean(roles?.some((role) => (STAFF_ROLES as string[]).includes(role)));
}
