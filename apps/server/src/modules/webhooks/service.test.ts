/**
 * Service-layer tests for the webhooks module.
 *
 * Hits the real Neon dev DB (see apps/server/CLAUDE.md for why we don't
 * mock). Uses an injectable `fetchImpl` + `now()` so we can simulate
 * receiver responses and backoff without waiting for real clocks.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { signDelivery } from "./crypto";
import { WebhookEndpointNotFound, WebhookLimitExceeded } from "./errors";
import {
  createWebhooksService,
  matchesEventType,
} from "./service";

const APP_SECRET = "test-app-secret-32-bytes-minimum-xxxxxxxxx";

function makeSvc(opts: { fetchImpl?: typeof fetch; now?: () => Date } = {}) {
  return createWebhooksService(
    { db, appSecret: APP_SECRET },
    {
      maxEndpointsPerOrg: 3,
      // Leave autoPauseThreshold at default (20) so single-failure tests
      // don't trip the auto-pause.
      ...opts,
    },
  );
}

describe("webhooks service — pure helpers", () => {
  test("matchesEventType: empty array subscribes to all", () => {
    expect(matchesEventType([], "check_in.completed")).toBe(true);
    expect(matchesEventType([], "anything")).toBe(true);
  });
  test("matchesEventType: exact match", () => {
    expect(matchesEventType(["check_in.completed"], "check_in.completed")).toBe(
      true,
    );
    expect(matchesEventType(["check_in.completed"], "check_in.reset")).toBe(
      false,
    );
  });
  test("matchesEventType: wildcard prefix", () => {
    expect(matchesEventType(["check_in.*"], "check_in.completed")).toBe(true);
    expect(matchesEventType(["check_in.*"], "check_in.reset")).toBe(true);
    expect(matchesEventType(["check_in.*"], "badge.unlocked")).toBe(false);
  });
  test("matchesEventType: star matches anything", () => {
    expect(matchesEventType(["*"], "arbitrary.event")).toBe(true);
  });
});

describe("webhooks service — CRUD", () => {
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("webhooks-svc");
  });
  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("create returns plaintext secret only once; list hides it", async () => {
    const svc = makeSvc();
    const { endpoint, secret } = await svc.createEndpoint(orgId, {
      name: "test",
      url: "https://example.test/hook",
    });
    expect(secret).toMatch(/^whsec_[a-f0-9]{64}$/);
    expect(endpoint.secretHint).toMatch(/^whsec_.+….+$/);
    expect((endpoint as unknown as { secretCiphertext?: string }).secretCiphertext).toBeUndefined();

    const list = await svc.listEndpoints(orgId);
    expect(list.items.find((e) => e.id === endpoint.id)).toBeDefined();
    expect(
      (list.items[0] as unknown as { secretCiphertext?: string }).secretCiphertext,
    ).toBeUndefined();
  });

  test("limit enforced at maxEndpointsPerOrg=3", async () => {
    const svc = makeSvc();
    // org already has 1 from the previous test; add 2 more to hit 3
    await svc.createEndpoint(orgId, {
      name: "b",
      url: "https://example.test/b",
    });
    await svc.createEndpoint(orgId, {
      name: "c",
      url: "https://example.test/c",
    });
    await expect(
      svc.createEndpoint(orgId, {
        name: "over",
        url: "https://example.test/over",
      }),
    ).rejects.toBeInstanceOf(WebhookLimitExceeded);
  });

  test("get / update / delete flow", async () => {
    const svc = makeSvc();
    const fresh = await createTestOrg("webhooks-crud");
    try {
      const { endpoint } = await svc.createEndpoint(fresh, {
        name: "original",
        url: "https://example.test/1",
      });

      const fetched = await svc.getEndpoint(fresh, endpoint.id);
      expect(fetched.name).toBe("original");

      const updated = await svc.updateEndpoint(fresh, endpoint.id, {
        name: "renamed",
        status: "disabled",
      });
      expect(updated.name).toBe("renamed");
      expect(updated.status).toBe("disabled");
      expect(updated.disabledAt).not.toBeNull();

      await svc.deleteEndpoint(fresh, endpoint.id);
      await expect(
        svc.getEndpoint(fresh, endpoint.id),
      ).rejects.toBeInstanceOf(WebhookEndpointNotFound);
    } finally {
      await deleteTestOrg(fresh);
    }
  });

  test("rotateSecret produces a new usable secret", async () => {
    const fresh = await createTestOrg("webhooks-rotate");
    try {
      const svc = makeSvc();
      const created = await svc.createEndpoint(fresh, {
        name: "r",
        url: "https://example.test/r",
      });
      const rotated = await svc.rotateSecret(fresh, created.endpoint.id);
      expect(rotated.secret).not.toBe(created.secret);
      expect(rotated.endpoint.secretHint).not.toBe(created.endpoint.secretHint);
    } finally {
      await deleteTestOrg(fresh);
    }
  });

  test("getEndpoint with non-uuid returns WebhookEndpointNotFound", async () => {
    const svc = makeSvc();
    await expect(
      svc.getEndpoint(orgId, "not-a-uuid"),
    ).rejects.toBeInstanceOf(WebhookEndpointNotFound);
  });
});

describe("webhooks service — dispatch + delivery", () => {
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("webhooks-dispatch");
  });
  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("dispatch fans out to matching active endpoints only", async () => {
    const svc = makeSvc();
    const all = await svc.createEndpoint(orgId, {
      name: "all",
      url: "https://example.test/all",
    });
    const onlyCheckIn = await svc.createEndpoint(orgId, {
      name: "check-in-only",
      url: "https://example.test/ci",
      eventTypes: ["check_in.*"],
    });
    const unrelated = await svc.createEndpoint(orgId, {
      name: "unrelated",
      url: "https://example.test/badge",
      eventTypes: ["badge.*"],
    });

    const result = await svc.dispatch({
      organizationId: orgId,
      eventType: "check_in.completed",
      payload: { foo: 1 },
    });
    expect(result.queued).toBe(2); // all + onlyCheckIn, not unrelated

    // Clean up so next tests start from zero deliveries
    await svc.deleteEndpoint(orgId, all.endpoint.id);
    await svc.deleteEndpoint(orgId, onlyCheckIn.endpoint.id);
    await svc.deleteEndpoint(orgId, unrelated.endpoint.id);
  });

  test("delivery success marks delivery + resets endpoint counter", async () => {
    const receivedHeaders: Record<string, string> = {};
    let receivedBody = "";
    const fetchImpl: typeof fetch = async (_url, init) => {
      Object.entries(init?.headers ?? {}).forEach(([k, v]) => {
        receivedHeaders[k.toLowerCase()] = String(v);
      });
      receivedBody = String(init?.body ?? "");
      return new Response("ok", { status: 200 });
    };
    const svc = makeSvc({ fetchImpl });

    const { endpoint, secret } = await svc.createEndpoint(orgId, {
      name: "success-test",
      url: "https://example.test/ok",
    });

    await svc.dispatch({
      organizationId: orgId,
      eventType: "check_in.completed",
      payload: { userId: "u1" },
    });
    const res = await svc.deliverPending();
    expect(res.attempted).toBe(1);
    expect(res.succeeded).toBe(1);
    expect(res.failed).toBe(0);

    // Verify the outbound signature the receiver would compute matches
    const ts = Number(receivedHeaders["x-apollokit-timestamp"]);
    expect(ts).toBeGreaterThan(0);
    const expected = await signDelivery({
      secret,
      timestamp: ts,
      rawBody: receivedBody,
    });
    expect(receivedHeaders["x-apollokit-signature"]).toBe(expected);

    // Body has the declared stable shape
    const parsed = JSON.parse(receivedBody);
    expect(parsed).toMatchObject({
      type: "check_in.completed",
      organization_id: orgId,
      data: { userId: "u1" },
    });
    expect(typeof parsed.id).toBe("string");
    expect(typeof parsed.created_at).toBe("string");

    await svc.deleteEndpoint(orgId, endpoint.id);
  });

  test("5xx response reschedules with backoff (not dead after first try)", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("boom", { status: 503 });
    const svc = makeSvc({ fetchImpl });

    const { endpoint } = await svc.createEndpoint(orgId, {
      name: "retry-test",
      url: "https://example.test/503",
    });
    await svc.dispatch({
      organizationId: orgId,
      eventType: "foo.bar",
      payload: {},
    });
    const res = await svc.deliverPending();
    expect(res.attempted).toBe(1);
    expect(res.failed).toBe(1);

    // Next call should NOT pick the row up — backoff pushed it into the
    // future, so there is nothing due right now.
    const res2 = await svc.deliverPending();
    expect(res2.attempted).toBe(0);

    await svc.deleteEndpoint(orgId, endpoint.id);
  });

  test("maxAttempts failures mark delivery dead", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("boom", { status: 500 });
    // Inject advancing clock so each retry is due immediately
    let t = Date.now();
    const svc = createWebhooksService(
      { db, appSecret: APP_SECRET },
      {
        fetchImpl,
        maxAttempts: 2,
        now: () => new Date(t),
      },
    );

    const { endpoint } = await svc.createEndpoint(orgId, {
      name: "dead-test",
      url: "https://example.test/dead",
    });
    await svc.dispatch({
      organizationId: orgId,
      eventType: "foo.bar",
      payload: {},
    });

    await svc.deliverPending(); // attempt 1 → failed
    t += 10 * 60_000; // jump past the default backoff
    await svc.deliverPending(); // attempt 2 → dead (maxAttempts=2)

    const deliveries = (await svc.listDeliveries(orgId, endpoint.id, {})).items;
    expect(deliveries[0]?.status).toBe("dead");
    expect(deliveries[0]?.attemptCount).toBeGreaterThanOrEqual(2);

    await svc.deleteEndpoint(orgId, endpoint.id);
  });

  test("replayDelivery re-queues using the original event id", async () => {
    const fetchImpl: typeof fetch = async () => new Response("", { status: 200 });
    const svc = makeSvc({ fetchImpl });

    const { endpoint } = await svc.createEndpoint(orgId, {
      name: "replay-test",
      url: "https://example.test/ok2",
    });
    await svc.dispatch({
      organizationId: orgId,
      eventId: "00000000-0000-4000-8000-000000000abc",
      eventType: "x.y",
      payload: { v: 1 },
    });
    await svc.deliverPending();
    const [succeeded] = (await svc.listDeliveries(orgId, endpoint.id, {})).items;
    expect(succeeded?.status).toBe("success");

    const replay = await svc.replayDelivery(orgId, succeeded!.id);
    expect(replay.eventId).toBe(succeeded!.eventId);
    expect(replay.status).toBe("pending");

    await svc.deleteEndpoint(orgId, endpoint.id);
  });
});
