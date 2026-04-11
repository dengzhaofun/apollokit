/**
 * Test fixtures for apps/server.
 *
 * The isolation model is: each test file seeds its own `organization`
 * row with a random id and relies on ON DELETE CASCADE to clean up
 * everything that references it (`check_in_configs` →
 * `check_in_user_states`, future `points_*`, `task_*`, …). The
 * fixture helpers here are the only bits of code that know that the
 * `organization` table exists — test files never touch it directly.
 *
 * We deliberately bypass Better Auth's org API: the service layer
 * does not care how an organization was created, only that the id
 * exists. Going through Better Auth would add a session + user + member
 * dance that's pure setup noise for service tests.
 */
import { eq } from "drizzle-orm";

import { db } from "../db";
import { organization, member, session, user, account } from "../schema";

export async function createTestOrg(label = "test"): Promise<string> {
  const id = `test-org-${crypto.randomUUID()}`;
  await db.insert(organization).values({
    id,
    name: `${label} ${id}`,
    // slug is unique; embedding the uuid guarantees no collisions
    slug: id,
    createdAt: new Date(),
  });
  return id;
}

export async function deleteTestOrg(id: string): Promise<void> {
  // Cascade takes care of `check_in_configs`, `check_in_user_states`,
  // and any future module tables that reference `organization.id`.
  await db.delete(organization).where(eq(organization.id, id));
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
