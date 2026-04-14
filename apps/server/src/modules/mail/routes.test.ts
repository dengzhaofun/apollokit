/**
 * Route-layer tests for mail.
 *
 * Covers the HTTP edges: `requireAdminOrApiKey` 401, zod validation → 400,
 * router `onError` mapping of `ModuleError` to the declared status codes,
 * and one happy-path create-list cycle. Deeper business logic lives in
 * `service.test.ts`.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import app from "../../index";
import { organization, user } from "../../schema";

const ORIGIN = "http://localhost:8787";

type SignedInFixture = {
  cookie: string;
  orgId: string;
  adminUserId: string;
};

async function signUpAndOrg(): Promise<SignedInFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `mail-routes-${stamp}@example.test`;

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      email,
      password: "password12345",
      name: "Mail Routes Test",
    }),
  });
  if (signUp.status !== 200) {
    throw new Error(`sign-up failed ${signUp.status}: ${await signUp.text()}`);
  }
  const setCookie = signUp.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not return a cookie");
  const cookie = setCookie.split(";")[0]!;

  const createOrg = await app.request("/api/auth/organization/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      cookie,
    },
    body: JSON.stringify({
      name: `Mail Routes Org ${stamp}`,
      slug: `mail-routes-${stamp}`,
    }),
  });
  if (createOrg.status !== 200) {
    throw new Error(`org create failed ${createOrg.status}`);
  }
  const orgBody = (await createOrg.json()) as { id: string };
  const orgId = orgBody.id;

  const setActive = await app.request("/api/auth/organization/set-active", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      cookie,
    },
    body: JSON.stringify({ organizationId: orgId }),
  });
  if (setActive.status !== 200) {
    throw new Error(`set-active failed ${setActive.status}`);
  }

  const userRows = await db.select().from(user).where(eq(user.email, email));
  const adminUserId = userRows[0]!.id;

  return { cookie, orgId, adminUserId };
}

describe("mail routes", () => {
  let fx: SignedInFixture;

  beforeAll(async () => {
    fx = await signUpAndOrg();
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  test("GET /api/mail/messages without cookie → 401", async () => {
    const res = await app.request("/api/mail/messages");
    expect(res.status).toBe(401);
  });

  test("happy path: create broadcast, list, get detail, revoke", async () => {
    const create = await app.request("/api/mail/messages", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        title: "Route Broadcast",
        content: "Hello players",
        rewards: [],
        targetType: "broadcast",
      }),
    });
    expect(create.status).toBe(201);
    const mail = (await create.json()) as {
      id: string;
      title: string;
      targetType: string;
      senderAdminId: string | null;
    };
    expect(mail.title).toBe("Route Broadcast");
    expect(mail.targetType).toBe("broadcast");
    expect(mail.senderAdminId).toBe(fx.adminUserId);

    const list = await app.request("/api/mail/messages", {
      headers: { cookie: fx.cookie },
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      items: { id: string }[];
      nextCursor: string | null;
    };
    expect(body.items.some((i) => i.id === mail.id)).toBe(true);

    const detail = await app.request(`/api/mail/messages/${mail.id}`, {
      headers: { cookie: fx.cookie },
    });
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      id: string;
      readCount: number;
      claimCount: number;
      targetCount: number | null;
    };
    expect(detailBody.id).toBe(mail.id);
    expect(detailBody.readCount).toBe(0);
    expect(detailBody.claimCount).toBe(0);
    expect(detailBody.targetCount).toBeNull();

    const revoke = await app.request(
      `/api/mail/messages/${mail.id}/revoke`,
      { method: "POST", headers: { cookie: fx.cookie } },
    );
    expect(revoke.status).toBe(204);
  });

  test("zod validation: broadcast with targetUserIds is a 201 (server-side invariant) OR rejected — we enforce via service invariant → 400", async () => {
    // Admin HTTP does not expose originSource. But the invalid-target rule
    // lives in the service validator — `targetType='broadcast'` + non-empty
    // `targetUserIds` is rejected with mail.invalid_target.
    const res = await app.request("/api/mail/messages", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        title: "Bad",
        content: "x",
        rewards: [],
        targetType: "broadcast",
        targetUserIds: ["u"],
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("mail.invalid_target");
  });

  test("zod validation: unknown targetType → 400", async () => {
    const res = await app.request("/api/mail/messages", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        title: "Bad",
        content: "x",
        rewards: [],
        targetType: "nonsense",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("GET detail for unknown id → 404 via onError", async () => {
    const res = await app.request(
      "/api/mail/messages/00000000-0000-0000-0000-000000000000",
      { headers: { cookie: fx.cookie } },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("mail.message_not_found");
  });

  test("DELETE unknown id → 404", async () => {
    const res = await app.request(
      "/api/mail/messages/00000000-0000-0000-0000-000000000000",
      { method: "DELETE", headers: { cookie: fx.cookie } },
    );
    expect(res.status).toBe(404);
  });

  test("client routes require x-api-key (401 without)", async () => {
    const res = await app.request(
      "/api/client/mail/messages?endUserId=u-any",
    );
    expect(res.status).toBe(401);
  });
});
