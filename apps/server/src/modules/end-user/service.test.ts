/**
 * Service-layer tests for the end-user module.
 *
 * Exercises `syncUser` merge semantics across both origins (managed /
 * synced) and the CRUD surface (`list`, `get`, `update`, `setDisabled`,
 * `signOutAll`, `remove`). Managed rows are produced directly via the
 * `endUserAuth` instance to keep this file self-contained; we don't
 * stand up an HTTP server here.
 *
 * Follows the test convention in `apps/server/CLAUDE.md`: real Neon dev
 * branch, per-file fresh org, cascade cleanup.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { endUserAuth, EU_ORG_ID_HEADER, scopeEmail } from "../../end-user-auth";
import { euAccount, euSession, euUser } from "../../schema/end-user-auth";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { and, eq } from "drizzle-orm";
import { createEndUserService } from "./service";

/**
 * Create a managed (credential-backed) eu_user by invoking the Better
 * Auth sign-up API directly. This exercises the same hook chain a real
 * request would hit — including the email-namespacing hook — and is the
 * honest way to produce a managed row for tests.
 */
async function createManagedPlayer(
  orgId: string,
  email: string,
  password = "pw12345678",
  name = "Managed Player",
): Promise<string> {
  const res = await endUserAuth.api.signUpEmail({
    body: { email, password, name },
    headers: new Headers({ [EU_ORG_ID_HEADER]: orgId }),
  });
  // signUpEmail returns `{ user, token }`; user.id is the eu_user PK.
  return res.user.id;
}

describe("end-user service — syncUser", () => {
  const svc = createEndUserService({ db });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("end-user-sync");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("creates a fresh synced row, no credential account", async () => {
    const r = await svc.syncUser(orgId, {
      externalId: "u_alice",
      email: "alice@example.com",
      name: "Alice",
    });
    expect(r.created).toBe(true);

    const [row] = await db
      .select()
      .from(euUser)
      .where(eq(euUser.id, r.euUserId));
    expect(row?.email).toBe(scopeEmail(orgId, "alice@example.com"));
    expect(row?.externalId).toBe("u_alice");
    expect(row?.organizationId).toBe(orgId);

    const accounts = await db
      .select()
      .from(euAccount)
      .where(eq(euAccount.userId, r.euUserId));
    expect(accounts).toHaveLength(0); // synced-only, no credential
  });

  test("is idempotent on (orgId, externalId) — returns same id, created:false", async () => {
    const first = await svc.syncUser(orgId, {
      externalId: "u_bob",
      email: "bob@example.com",
      name: "Bob",
    });
    const second = await svc.syncUser(orgId, {
      externalId: "u_bob",
      email: "bob-changed-email@example.com",
      name: "Bob Updated",
    });
    expect(second.created).toBe(false);
    expect(second.euUserId).toBe(first.euUserId);

    const [row] = await db
      .select()
      .from(euUser)
      .where(eq(euUser.id, first.euUserId));
    // Synced-only row → name gets overwritten on resync
    expect(row?.name).toBe("Bob Updated");
  });

  test("falls back to (orgId, email) when externalId not supplied", async () => {
    const a = await svc.syncUser(orgId, {
      email: "carol@example.com",
      name: "Carol",
    });
    const b = await svc.syncUser(orgId, {
      email: "carol@example.com",
      name: "Carol 2",
    });
    expect(b.euUserId).toBe(a.euUserId);
    expect(b.created).toBe(false);
  });

  test("does NOT overwrite managed fields when merging onto a managed row", async () => {
    const managedId = await createManagedPlayer(
      orgId,
      "dave@example.com",
      "pw12345678",
      "Dave Managed",
    );

    const r = await svc.syncUser(orgId, {
      externalId: "u_dave_ext",
      email: "dave@example.com",
      name: "Dave Synced Name",
      image: "https://cdn/dave.png",
    });
    expect(r.euUserId).toBe(managedId);

    const [row] = await db
      .select()
      .from(euUser)
      .where(eq(euUser.id, managedId));
    // Managed name + image preserved
    expect(row?.name).toBe("Dave Managed");
    expect(row?.image).toBeNull();
    // externalId got linked onto the managed row
    expect(row?.externalId).toBe("u_dave_ext");
    // Credential account still alive
    const accounts = await db
      .select()
      .from(euAccount)
      .where(
        and(
          eq(euAccount.userId, managedId),
          eq(euAccount.providerId, "credential"),
        ),
      );
    expect(accounts).toHaveLength(1);
  });

  test("throws EndUserIdentityConflict when externalId conflicts with existing email row", async () => {
    await svc.syncUser(orgId, {
      externalId: "u_eve_a",
      email: "eve@example.com",
      name: "Eve A",
    });
    await expect(
      svc.syncUser(orgId, {
        externalId: "u_eve_b",
        email: "eve@example.com",
        name: "Eve B",
      }),
    ).rejects.toThrow(/bound to a different email/i);
  });
});

describe("end-user service — list / get / update", () => {
  const svc = createEndUserService({ db });
  let orgId: string;
  const created: string[] = [];

  beforeAll(async () => {
    orgId = await createTestOrg("end-user-list");

    // Seed: 2 managed, 3 synced
    created.push(await createManagedPlayer(orgId, "m1@example.com"));
    created.push(await createManagedPlayer(orgId, "m2@example.com"));

    created.push(
      (
        await svc.syncUser(orgId, {
          externalId: "u_s1",
          email: "s1@example.com",
          name: "S One",
        })
      ).euUserId,
    );
    created.push(
      (
        await svc.syncUser(orgId, {
          externalId: "u_s2",
          email: "s2@example.com",
          name: "S Two",
        })
      ).euUserId,
    );
    created.push(
      (
        await svc.syncUser(orgId, {
          externalId: "u_s3",
          email: "s3@example.com",
          name: "S Three",
        })
      ).euUserId,
    );
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("list returns all 5 with correct origin labels", async () => {
    const { items } = await svc.list(orgId);
    expect(items).toHaveLength(5);
    expect(items.filter((i) => i.origin === "managed")).toHaveLength(2);
    expect(items.filter((i) => i.origin === "synced")).toHaveLength(3);
  });

  test("list filters by origin=managed", async () => {
    const r = await svc.list(orgId, { origin: "managed" });
    expect(r.items).toHaveLength(2);
    expect(r.items.every((i) => i.origin === "managed")).toBe(true);
  });

  test("list filters by origin=synced", async () => {
    const r = await svc.list(orgId, { origin: "synced" });
    expect(r.items).toHaveLength(3);
  });

  test("list search matches email and name substring", async () => {
    const byName = await svc.list(orgId, { q: "S Two" });
    expect(byName.items).toHaveLength(1);
    const byEmail = await svc.list(orgId, { q: "s1@example" });
    expect(byEmail.items).toHaveLength(1);
    const byExternal = await svc.list(orgId, { q: "u_s3" });
    expect(byExternal.items).toHaveLength(1);
  });

  test("list paginates with cursor", async () => {
    const first = await svc.list(orgId, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await svc.list(orgId, { limit: 2, cursor: first.nextCursor ?? undefined });
    expect(second.items.length).toBeGreaterThanOrEqual(1);
    expect(first.items.map((i) => i.id)).not.toEqual(
      second.items.map((i) => i.id),
    );
  });

  test("get returns unscoped email + origin + sessionCount", async () => {
    const row = await svc.get(orgId, created[0]!);
    expect(row.email).toBe("m1@example.com");
    expect(row.origin).toBe("managed");
    // sign-up auto-signs-in → managed players carry one live session
    expect(row.sessionCount).toBeGreaterThanOrEqual(1);
  });

  test("get throws EndUserNotFound for unknown id", async () => {
    await expect(svc.get(orgId, "does-not-exist")).rejects.toThrow(
      /not found/i,
    );
  });

  test("update patches individual fields", async () => {
    const target = created[2]!;
    const updated = await svc.update(orgId, target, {
      name: "Renamed",
      emailVerified: false,
    });
    expect(updated.name).toBe("Renamed");
    expect(updated.emailVerified).toBe(false);
  });
});

describe("end-user service — setDisabled / signOutAll / remove", () => {
  const svc = createEndUserService({ db });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("end-user-admin-ops");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("setDisabled=true flips flag and revokes active sessions", async () => {
    const id = await createManagedPlayer(orgId, "ban-target@example.com");
    // Seed an active session by signing in
    await endUserAuth.api.signInEmail({
      body: { email: "ban-target@example.com", password: "pw12345678" },
      headers: new Headers({ [EU_ORG_ID_HEADER]: orgId }),
    });
    const before = await db.select().from(euSession).where(eq(euSession.userId, id));
    expect(before.length).toBeGreaterThan(0);

    const updated = await svc.setDisabled(orgId, id, true);
    expect(updated.disabled).toBe(true);

    const after = await db.select().from(euSession).where(eq(euSession.userId, id));
    expect(after).toHaveLength(0);
  });

  test("setDisabled=false flips back without re-creating sessions", async () => {
    const id = await createManagedPlayer(orgId, "unban@example.com");
    await svc.setDisabled(orgId, id, true);
    const updated = await svc.setDisabled(orgId, id, false);
    expect(updated.disabled).toBe(false);
  });

  test("signOutAll drops sessions without disabling", async () => {
    const id = await createManagedPlayer(orgId, "revoke@example.com");
    await endUserAuth.api.signInEmail({
      body: { email: "revoke@example.com", password: "pw12345678" },
      headers: new Headers({ [EU_ORG_ID_HEADER]: orgId }),
    });
    const r = await svc.signOutAll(orgId, id);
    expect(r.revoked).toBeGreaterThan(0);

    const user = await svc.get(orgId, id);
    expect(user.disabled).toBe(false);
    expect(user.sessionCount).toBe(0);
  });

  test("remove hard-deletes and cascades to eu_account / eu_session", async () => {
    const id = await createManagedPlayer(orgId, "goner@example.com");
    await svc.remove(orgId, id);

    const rows = await db.select().from(euUser).where(eq(euUser.id, id));
    expect(rows).toHaveLength(0);
    const accs = await db
      .select()
      .from(euAccount)
      .where(eq(euAccount.userId, id));
    expect(accs).toHaveLength(0);
  });

  test("remove throws for unknown id", async () => {
    await expect(svc.remove(orgId, "nope")).rejects.toThrow(/not found/i);
  });
});

describe("end-user service — tenant isolation", () => {
  const svc = createEndUserService({ db });
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    orgA = await createTestOrg("end-user-iso-a");
    orgB = await createTestOrg("end-user-iso-b");
  });

  afterAll(async () => {
    await deleteTestOrg(orgA);
    await deleteTestOrg(orgB);
  });

  test("same email in two orgs is allowed and produces two rows", async () => {
    const a = await svc.syncUser(orgA, {
      email: "twin@example.com",
      name: "Twin A",
      externalId: "u_twin",
    });
    const b = await svc.syncUser(orgB, {
      email: "twin@example.com",
      name: "Twin B",
      externalId: "u_twin",
    });
    expect(a.euUserId).not.toBe(b.euUserId);
  });

  test("list in orgA does not leak orgB rows", async () => {
    const a = await svc.list(orgA);
    const b = await svc.list(orgB);
    expect(a.items.every((i) => i.email === "twin@example.com")).toBe(true);
    expect(b.items.every((i) => i.email === "twin@example.com")).toBe(true);
    // Each org sees exactly its own row
    expect(a.items).toHaveLength(1);
    expect(b.items).toHaveLength(1);
  });

  test("get with orgA's id from orgB scope throws not found", async () => {
    const { items } = await svc.list(orgA);
    const aId = items[0]!.id;
    await expect(svc.get(orgB, aId)).rejects.toThrow(/not found/i);
  });
});
