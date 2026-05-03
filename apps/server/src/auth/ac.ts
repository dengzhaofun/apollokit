/**
 * Access control statements + role definitions for the admin app.
 *
 * Wired into Better Auth's `organization` plugin in `../auth.ts`. Every
 * permission check (`requireOrgPermission` / `requirePermission` middleware
 * on the server, `useCan`/`<Can>` on the client) traces back to the matrix
 * here.
 *
 * Two layers of RBAC, single ac registry:
 *
 *   ─── Org-level (member.role — billing, member mgmt, project mgmt) ───
 *   orgOwner   — full company control: billing.manage, transfer/delete org,
 *                invite/remove org members, create/delete projects.
 *   orgAdmin   — invite org members + create/update projects, read billing.
 *   orgViewer  — read-only billing & company metadata. No project access
 *                unless added as teamMember.
 *
 *   ─── Team-level (teamMember.role — business data inside a project) ───
 *   owner      — full project control + transfer/delete project resources.
 *   admin      — full business + apiKey/webhooks management, read auditLog.
 *   operator   — daily ops: read+write business modules, no apiKey, no audit.
 *   viewer     — read-only on business modules.
 *   member     — alias of operator. Backward-compat for existing rows.
 *
 * The two layers live in ONE `ac` registry because Better Auth's
 * organization plugin only accepts one `roles` config. Role name (string)
 * decides which table to look up at permission-check time:
 *   - org-level actions → `member` table query
 *   - team-level actions → `teamMember` table query
 *
 * `dynamicAccessControl` (enabled in auth.ts) lets tenants define
 * additional roles at runtime via `auth.api.createRole`. Those land in
 * the Better Auth `organizationRole` table and are resolved at
 * permission check time without any custom code on our side.
 *
 * The `manage` action is treated as "all actions on this resource".
 */

import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Resource × action dictionary — single ac for both layers.
 *
 * - `defaultStatements` ships Better Auth's built-in `organization` /
 *   `member` / `invitation` / `team` resources. We spread it so org
 *   built-ins (invite-member, create-team, update-org, etc.) keep
 *   working with our role names.
 * - Module names use camelCase (matching `apps/admin/src/lib/capabilities.ts`).
 *   Folder name `check-in` becomes `checkIn`.
 *
 * Actions: `read`, `write`, `manage`, plus per-module verbs (`publish`,
 * `issue`, …) where needed. `manage` is the wildcard.
 */
export const statement = {
  ...defaultStatements,

  // ─── Org-level (member.role-bound) ─────────────────────────────
  billing: ["read", "manage"],
  orgMember: ["invite", "remove"],

  // ─── Team-level (teamMember.role-bound) ────────────────────────
  // Business modules — admin-facing, project-scoped (tenantId).
  activity: ["read", "write", "publish", "manage"],
  analytics: ["read", "manage"],
  announcement: ["read", "write", "manage"],
  assistPool: ["read", "write", "manage"],
  auditLog: ["read"],
  badge: ["read", "write", "manage"],
  banner: ["read", "write", "manage"],
  battlePass: ["read", "write", "manage"],
  cdkey: ["read", "write", "issue", "manage"],
  character: ["read", "write", "manage"],
  checkIn: ["read", "write", "manage"],
  clientCredentials: ["read", "write", "manage"],
  cms: ["read", "write", "publish", "manage"],
  collection: ["read", "write", "manage"],
  currency: ["read", "write", "manage"],
  dialogue: ["read", "write", "manage"],
  endUser: ["read", "write", "manage"],
  entity: ["read", "write", "manage"],
  eventCatalog: ["read", "write", "manage"],
  exchange: ["read", "write", "manage"],
  experiment: ["read", "write", "manage"],
  friend: ["read", "write", "manage"],
  friendGift: ["read", "write", "manage"],
  guild: ["read", "write", "manage"],
  invite: ["read", "write", "manage"],
  item: ["read", "write", "manage"],
  leaderboard: ["read", "write", "manage"],
  level: ["read", "write", "manage"],
  lottery: ["read", "write", "manage"],
  mail: ["read", "write", "manage"],
  matchSquad: ["read", "write", "manage"],
  mediaLibrary: ["read", "write", "manage"],
  navigation: ["read", "write", "manage"],
  offlineCheckIn: ["read", "write", "manage"],
  rank: ["read", "write", "manage"],
  shop: ["read", "write", "manage"],
  storageBox: ["read", "write", "manage"],
  task: ["read", "write", "manage"],
  triggers: ["read", "write", "manage"],
  webhooks: ["read", "write", "manage"],

  // Platform — team-scoped (apikey carries tenantId via metadata).
  apiKey: ["read", "write", "manage"],
} as const;

export const ac = createAccessControl(statement);

/**
 * Resources that live at the team (project / tenantId) layer. Anything
 * not in `defaultStatements` and not in the small org-level set.
 */
const ORG_LEVEL_KEYS = new Set<keyof typeof statement>(["billing", "orgMember"]);

function teamLevelKeys(): (keyof typeof statement)[] {
  return (Object.keys(statement) as (keyof typeof statement)[]).filter(
    (k) => !(k in defaultStatements) && !ORG_LEVEL_KEYS.has(k),
  );
}

function manageEverywhere() {
  const out: Record<string, readonly string[]> = {};
  for (const r of teamLevelKeys()) {
    const actions = statement[r] as readonly string[];
    out[r] = actions.includes("manage") ? ["manage"] : actions;
  }
  return out;
}

function readEverywhere() {
  const out: Record<string, readonly string[]> = {};
  for (const r of teamLevelKeys()) {
    const actions = statement[r] as readonly string[];
    if (actions.includes("read")) out[r] = ["read"];
  }
  return out;
}

function operatorEverywhere() {
  const out: Record<string, readonly string[]> = {};
  for (const r of teamLevelKeys()) {
    const actions = statement[r] as readonly string[];
    const grants = actions.filter((a) => a !== "manage");
    if (grants.length > 0) out[r] = grants;
  }
  // operator: no audit-log, no api-key, no platform internals.
  delete out.auditLog;
  delete out.apiKey;
  return out;
}

// ─── Org-level roles (member.role) ──────────────────────────────

// orgOwner — full company control: own everything Better Auth ships
// for org admin/delete + billing.manage + orgMember invite/remove.
// Also retains team-level statements so org owner can act inside any
// project (the require-permission middleware additionally short-circuits
// for org owner, see middleware/require-permission.ts).
export const orgOwner = ac.newRole({
  ...ownerAc.statements,
  billing: ["read", "manage"],
  orgMember: ["invite", "remove"],
  ...manageEverywhere(),
});

// orgAdmin — invite/remove org members, create/update projects, read billing.
// Cannot delete the org or change billing settings.
export const orgAdmin = ac.newRole({
  ...adminAc.statements,
  billing: ["read"],
  orgMember: ["invite", "remove"],
});

// orgViewer — read-only billing + company metadata. Project access requires
// being added as a teamMember on the specific project.
export const orgViewer = ac.newRole({
  ...memberAc.statements,
  billing: ["read"],
});

// ─── Team-level roles (teamMember.role) ─────────────────────────

// owner — full project control: manage every business resource + apiKey + auditLog.
// Spreads `memberAc.statements` first to anchor type inference for ac.newRole's
// strict Subset checker (the helper functions return Record<string, ...> which
// won't satisfy Subset on its own).
export const owner = ac.newRole({
  ...memberAc.statements,
  ...manageEverywhere(),
});

// admin — manage business modules + apiKey rw + audit read. No org-level grants.
export const admin = ac.newRole({
  ...memberAc.statements,
  ...manageEverywhere(),
  apiKey: ["read", "write"],
  auditLog: ["read"],
});

// operator — read+write business modules. No api-key, no audit, no billing.
export const operator = ac.newRole({
  ...memberAc.statements,
  ...operatorEverywhere(),
});

// viewer — global read-only on business modules.
export const viewer = ac.newRole({
  ...memberAc.statements,
  ...readEverywhere(),
  auditLog: [],
  apiKey: [],
});

// member — alias of operator (backward compat for legacy `member.role = "member"` rows).
export const member = ac.newRole({
  ...memberAc.statements,
  ...operatorEverywhere(),
});

/**
 * Roles registered with Better Auth. `member.role` and `teamMember.role`
 * both store strings that look up here.
 */
export const roles = {
  // org-level
  orgOwner,
  orgAdmin,
  orgViewer,
  // team-level
  owner,
  admin,
  operator,
  viewer,
  member,
} as const;

export type RoleName = keyof typeof roles;
export type ResourceName = keyof typeof statement;

export const ORG_LEVEL_ROLES = ["orgOwner", "orgAdmin", "orgViewer"] as const;
export type OrgRoleName = (typeof ORG_LEVEL_ROLES)[number];

export const TEAM_LEVEL_ROLES = ["owner", "admin", "operator", "viewer", "member"] as const;
export type TeamRoleName = (typeof TEAM_LEVEL_ROLES)[number];

/**
 * Names of every team-level (project/tenantId) business resource. Used by
 * the `/me/capabilities` route to enumerate what to check for the active
 * project.
 */
export const BUSINESS_RESOURCES: ResourceName[] = teamLevelKeys();

/**
 * Names of org-level resources (used for `/me/org-capabilities`).
 */
export const ORG_RESOURCES: ResourceName[] = Array.from(ORG_LEVEL_KEYS);
