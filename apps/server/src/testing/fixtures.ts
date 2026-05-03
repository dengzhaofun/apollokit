/**
 * Test fixtures for apps/server.
 *
 * Dual-tenant model: tests scope to a single project (Better Auth `team`)
 * which lives inside a single organization. The shared id stored on
 * business tables is `tenant_id` and FKs to `team.id`. To keep service
 * tests painless we still expose `createTestOrg(label) → string` that
 * returns one id usable as `tenantId` — under the hood that id names
 * BOTH the organization row AND the team row, so existing tests don't
 * have to change.
 *
 * If a test needs distinct org and team ids (e.g. cross-project
 * isolation tests) it should use `createTestProject(label)` which
 * returns `{ orgId, teamId }`.
 *
 * We bypass Better Auth's org API on purpose: services don't care how
 * a project came to be, only that the id exists. Going through Better
 * Auth would add a session + user + member dance that's pure setup
 * noise.
 */
import { asc, eq } from "drizzle-orm";

import { db } from "../db";
import {
  account,
  member,
  organization,
  session,
  team,
  user,
} from "../schema";

/**
 * Find the default project (Better Auth team) created when an org was
 * provisioned via `/api/auth/organization/create`. Returns the team id
 * that route tests can pass as `tenantId` to service factories.
 */
export async function getDefaultTeamId(orgId: string): Promise<string> {
  const [t] = await db
    .select({ id: team.id })
    .from(team)
    .where(eq(team.organizationId, orgId))
    .orderBy(asc(team.createdAt))
    .limit(1);
  if (!t) {
    throw new Error(`no team found for org ${orgId}`);
  }
  return t.id;
}

/**
 * Creates an organization + a single team (project) inside it. Both rows
 * share the SAME id so service tests can pass the returned string as
 * `tenantId` (FK → team.id) interchangeably with what they used to pass
 * as `organizationId`.
 */
export async function createTestOrg(label = "test"): Promise<string> {
  const id = `test-org-${crypto.randomUUID()}`;
  await db.insert(organization).values({
    id,
    name: `${label} ${id}`,
    // slug is unique; embedding the uuid guarantees no collisions
    slug: id,
    createdAt: new Date(),
  });
  // Team row with the same id — keeps existing tests' single-id calls
  // (service.foo(tenantId, …)) working without rewrites.
  await db.insert(team).values({
    id,
    name: `${label} project`,
    organizationId: id,
    createdAt: new Date(),
  });
  return id;
}

export async function deleteTestOrg(id: string): Promise<void> {
  // Cascade from organization removes team, teamMember, member, invitation,
  // and every business-table row whose tenant_id is this team.
  await db.delete(organization).where(eq(organization.id, id));
}

/**
 * Cross-project isolation helper — creates an org with two distinct teams
 * inside it, returning all three ids.
 */
export async function createTestProject(label = "test"): Promise<{
  orgId: string;
  teamId: string;
}> {
  const orgId = `test-org-${crypto.randomUUID()}`;
  const teamId = `test-team-${crypto.randomUUID()}`;
  await db.insert(organization).values({
    id: orgId,
    name: `${label} org`,
    slug: orgId,
    createdAt: new Date(),
  });
  await db.insert(team).values({
    id: teamId,
    name: `${label} project`,
    organizationId: orgId,
    createdAt: new Date(),
  });
  return { orgId, teamId };
}

/**
 * Creates a fresh Better Auth user + owner membership inside an existing
 * test org. Returns the admin user id. Used by the route-layer tests
 * that need `c.var.user` / `c.var.session` populated via a real cookie.
 *
 * We insert directly into the DB tables rather than going through the
 * Better Auth public API because we want deterministic ids and zero
 * coupling to the /api/auth HTTP surface — route tests should be free
 * of cookie-juggling.
 *
 * NOTE: Not currently used — route-layer tests go through
 * `app.request("/api/auth/sign-up/email", …)` for end-to-end fidelity.
 * Kept here as a documented option for future tests that want to skip
 * the auth surface entirely.
 */
export async function cleanupTestUser(email: string): Promise<void> {
  // Look up the user row; if it's gone we have nothing to clean.
  const rows = await db.select().from(user).where(eq(user.email, email));
  const u = rows[0];
  if (!u) return;

  // Delete order: sessions → members → accounts → user (FKs cascade
  // from user via better-auth's schema, but being explicit keeps the
  // order obvious for anyone reading cleanup logs).
  await db.delete(session).where(eq(session.userId, u.id));
  await db.delete(member).where(eq(member.userId, u.id));
  await db.delete(account).where(eq(account.userId, u.id));
  await db.delete(user).where(eq(user.id, u.id));
}
