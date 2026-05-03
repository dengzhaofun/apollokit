/**
 * Access control statements + role definitions for the admin app.
 *
 * Wired into Better Auth's `organization` plugin in `../auth.ts`. Every
 * permission check (`requirePermission` middleware on the server,
 * `useCan`/`<Can>` on the client) traces back to the matrix here.
 *
 * Four roles, RBAC, no ABAC. Phase 1 keeps statements coarse (read /
 * write / manage with a few business verbs); per-module fine-grained
 * actions are added in Phase 2 PRs alongside the modules they describe.
 *
 *   owner    — full control, billing, transfer, delete-org
 *   admin    — full business + member management, no billing
 *   operator — daily ops: read + write business modules
 *   viewer   — global read-only (finance / external auditor)
 *   member   — alias of operator. Backward-compat for existing rows
 *              whose `member.role = "member"` (the old default before
 *              the four-role rollout). New invites should pick one of
 *              the four canonical roles; the alias is registered so
 *              existing data keeps working without a migration.
 *
 * The `manage` action on a resource is treated as "all actions on this
 * resource". The middleware short-circuits on `manage` so we never
 * enumerate verbs at the call site.
 */

import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Resource × action dictionary.
 *
 * - `defaultStatements` ships the built-in `organization` / `member` /
 *   `invitation` / `team` resources from Better Auth — we spread it in
 *   so the org-management endpoints (invite-member, update-role, etc.)
 *   keep working with the four custom roles below.
 * - Module names use camelCase (matching `apps/admin/src/lib/capabilities.ts`).
 *   The kebab folder name `check-in` becomes `checkIn`. This keeps the
 *   key set stable when modules are renamed in their folder layout.
 *
 * Every business-module resource declares the canonical `read`,
 * `write`, `manage` triple. `manage` is the catch-all the middleware
 * uses for fall-through; `write` is the per-module mutation gate.
 * Add business-specific verbs (publish / issue / refund / …) only when
 * a module needs them — Phase 1 keeps it minimal.
 */
export const statement = {
  ...defaultStatements,

  // --- Business modules (admin-facing, org-scoped) ---
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
  mediaLibrary: ["read", "write", "manage"],
  navigation: ["read", "write", "manage"],
  offlineCheckIn: ["read", "write", "manage"],
  rank: ["read", "write", "manage"],
  shop: ["read", "write", "manage"],
  storageBox: ["read", "write", "manage"],
  task: ["read", "write", "manage"],
  triggers: ["read", "write", "manage"],
  webhooks: ["read", "write", "manage"],

  // --- Platform / org-management surface ---
  apiKey: ["read", "write", "manage"],
  billing: ["read", "manage"],
} as const;

export const ac = createAccessControl(statement);

/**
 * Build a record that grants `manage` on every business resource.
 *
 * `manage` is the wildcard the middleware checks for. Owner/admin
 * normally have `manage` everywhere, so we generate this once instead
 * of typing the same `[..., "manage"]` 40 times.
 */
function manageEverywhere() {
  const out: Record<string, readonly string[]> = {};
  for (const [resource, actions] of Object.entries(statement)) {
    // Skip Better Auth's built-in resources — those come from
    // `adminAc.statements` / `ownerAc.statements` so we don't
    // overwrite the framework's per-action grants (e.g. `member.create`
    // vs `member.delete` are distinct in the default admin role).
    if (resource in defaultStatements) continue;
    if ((actions as readonly string[]).includes("manage")) {
      out[resource] = ["manage"];
    } else {
      out[resource] = actions as readonly string[];
    }
  }
  return out;
}

/**
 * Build a record that grants `read` on every business resource that
 * exposes a `read` action. Used for the viewer role.
 */
function readEverywhere() {
  const out: Record<string, readonly string[]> = {};
  for (const [resource, actions] of Object.entries(statement)) {
    if (resource in defaultStatements) continue;
    if ((actions as readonly string[]).includes("read")) {
      out[resource] = ["read"];
    }
  }
  return out;
}

/**
 * Build a record that grants `read` + `write` (+ `publish` / `issue`
 * if defined) on every business resource. Used for the operator role.
 */
function operatorEverywhere() {
  const out: Record<string, readonly string[]> = {};
  for (const [resource, actions] of Object.entries(statement)) {
    if (resource in defaultStatements) continue;
    const grants: string[] = [];
    for (const a of actions as readonly string[]) {
      if (a === "manage") continue;
      // operator gets read/write/publish/issue but NOT super-actions
      // like billing.* (billing has only read+manage, no write).
      grants.push(a);
    }
    if (grants.length > 0) {
      out[resource] = grants;
    }
  }
  // operator does not get to look at audit logs or billing.
  delete out.auditLog;
  delete out.billing;
  delete out.apiKey;
  return out;
}

// owner — superset of admin + Better Auth ownerAc (org delete/transfer).
export const owner = ac.newRole({
  ...ownerAc.statements,
  ...manageEverywhere(),
  // ownerAc already covers organization.delete + member.transfer — we
  // intentionally do NOT spread admin's manage over the same keys.
});

// admin — every business module + member management, no org delete.
export const admin = ac.newRole({
  ...adminAc.statements,
  ...manageEverywhere(),
  // Override apiKey/billing to read-only for admin (only owner manages).
  apiKey: ["read", "write"],
  billing: ["read"],
  auditLog: ["read"],
});

// operator — read+write business modules, no member management,
// no audit-log, no billing, no api-key.
export const operator = ac.newRole({
  ...memberAc.statements,
  ...operatorEverywhere(),
});

// viewer — global read-only on business modules ONLY.
// Explicit empties for the platform-sensitive resources whose mere
// existence shouldn't leak: audit-log (operator activity), billing
// (financial), apiKey (server-to-server credentials).
export const viewer = ac.newRole({
  ...memberAc.statements,
  ...readEverywhere(),
  auditLog: [],
  billing: [],
  apiKey: [],
});

// member — alias of operator for backward compat with existing rows
// whose `member.role = "member"`. New invites should pick one of the
// four canonical roles above.
export const member = ac.newRole({
  ...memberAc.statements,
  ...operatorEverywhere(),
});

/**
 * Map of role name → role definition, ready to pass to
 * `organization({ ac, roles })`. Role keys correspond to values stored
 * in `member.role` (text column, comma-separated for multi-role).
 */
export const roles = { owner, admin, operator, viewer, member } as const;

export type RoleName = keyof typeof roles;
export type ResourceName = keyof typeof statement;

/**
 * Names of every business resource (excludes Better Auth built-ins).
 * Used by the `/me/capabilities` route to enumerate what to check.
 */
export const BUSINESS_RESOURCES = (
  Object.keys(statement) as ResourceName[]
).filter((r) => !(r in defaultStatements));
