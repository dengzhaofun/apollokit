/**
 * Service-layer tests for the badge module.
 *
 * Hits the real DB via `.dev.vars` (local pg per repo convention, see
 * memory `feedback_local_db_for_tests`). No mocks. A fresh test org is
 * seeded in `beforeAll`; ON DELETE CASCADE sweeps badge_nodes and
 * badge_signal_registry on teardown. The non-FK tables
 * (badge_signals / badge_dismissals) live without a referential link to
 * organization, so we clean them up explicitly at the end.
 *
 * Cache is injected as disabled (redis=undefined) to keep these tests
 * pure — we cover the tree assembly, dismissal filtering, and UPSERT
 * semantics. Redis integration is intentionally out of scope here.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../../db";
import {
  badgeDismissals,
  badgeSignals,
} from "../../schema/badge";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createBadgeService } from "./service";
import { computePeriodKey } from "./tree";

describe("badge service", () => {
  const svc = createBadgeService({ db });
  let orgId: string;
  // User ids unique per test — share one org across the file.
  let userCounter = 0;
  const newUser = () => `test-eu-${orgId}-${++userCounter}`;

  beforeAll(async () => {
    orgId = await createTestOrg("badge-svc");
  });

  afterAll(async () => {
    // Clean non-FK rows — badge_signals / badge_dismissals aren't cascade-linked.
    await db
      .delete(badgeSignals)
      .where(eq(badgeSignals.organizationId, orgId));
    await db
      .delete(badgeDismissals)
      .where(eq(badgeDismissals.organizationId, orgId));
    await deleteTestOrg(orgId);
  });

  // ─── Node CRUD ─────────────────────────────────────────────

  test("createNode + listNodes round-trip", async () => {
    const node = await svc.createNode(orgId, {
      key: "home",
      displayType: "dot",
      signalMatchMode: "none",
      aggregation: "any",
      dismissMode: "auto",
      sortOrder: 0,
      isEnabled: true,
    });
    expect(node.key).toBe("home");
    expect(node.parentKey).toBeNull();

    const list = await svc.listNodes(orgId);
    expect(list.find((n) => n.key === "home")).toBeDefined();
  });

  test("cycle detection rejects self-parent", async () => {
    await svc.createNode(orgId, {
      key: "cycle.a",
      displayType: "dot",
      signalMatchMode: "none",
      aggregation: "any",
      dismissMode: "auto",
      sortOrder: 0,
      isEnabled: true,
    });
    await expect(
      svc.updateNode(orgId, (await svc.getNode(orgId, "cycle.a")).id, {
        parentKey: "cycle.a",
      }),
    ).rejects.toMatchObject({ code: "badge.node_cycle" });
  });

  test("invalid signal binding: exact without signalKey rejected", async () => {
    await expect(
      svc.createNode(orgId, {
        key: "bad.exact",
        displayType: "dot",
        signalMatchMode: "exact",
        aggregation: "none",
        dismissMode: "auto",
        sortOrder: 0,
        isEnabled: true,
      }),
    ).rejects.toMatchObject({ code: "badge.invalid_signal_binding" });
  });

  // ─── Signal UPSERT — set / add / clear ─────────────────────

  test("signal set → add → clear round-trip", async () => {
    const endUserId = newUser();
    const signalKey = "test.counter.set-add-clear";

    const r1 = await svc.signal(orgId, {
      endUserId,
      signalKey,
      mode: "set",
      count: 5,
    });
    expect(r1.count).toBe(5);
    expect(r1.firstAppearedAt).not.toBeNull();

    const r2 = await svc.signal(orgId, {
      endUserId,
      signalKey,
      mode: "add",
      count: 3,
    });
    expect(r2.count).toBe(8);

    const r3 = await svc.signal(orgId, {
      endUserId,
      signalKey,
      mode: "clear",
    });
    expect(r3.count).toBe(0);
  });

  // ─── Tree — prefix aggregation ─────────────────────────────

  test("prefix-mode leaf sums matched signals", async () => {
    const endUserId = newUser();
    const parentKey = "prefix-test";
    const leafKey = "prefix-test.inbox";

    await svc.createNode(orgId, {
      key: parentKey,
      displayType: "dot",
      signalMatchMode: "none",
      aggregation: "any",
      dismissMode: "auto",
      sortOrder: 0,
      isEnabled: true,
    });
    await svc.createNode(orgId, {
      key: leafKey,
      parentKey,
      displayType: "number",
      signalMatchMode: "prefix",
      signalKeyPrefix: "mail.pt.",
      aggregation: "sum",
      dismissMode: "auto",
      sortOrder: 0,
      isEnabled: true,
    });

    await svc.signal(orgId, {
      endUserId,
      signalKey: "mail.pt.msg1",
      mode: "set",
      count: 1,
    });
    await svc.signal(orgId, {
      endUserId,
      signalKey: "mail.pt.msg2",
      mode: "set",
      count: 1,
    });

    const { nodes } = await svc.getTree(orgId, endUserId, parentKey);
    const parent = nodes[0]!;
    const leaf = parent.children.find((c) => c.key === leafKey)!;
    expect(leaf.count).toBe(2);
    // parent aggregates with `any` on the leaf's count=2 → 1
    expect(parent.count).toBeGreaterThan(0);
  });

  test("prefix-mode clearing one signal decrements the aggregate", async () => {
    const endUserId = newUser();
    const leafKey = "prefix-clear.inbox";

    await svc.createNode(orgId, {
      key: leafKey,
      displayType: "number",
      signalMatchMode: "prefix",
      signalKeyPrefix: "pc.inbox.",
      aggregation: "sum",
      dismissMode: "auto",
      sortOrder: 0,
      isEnabled: true,
    });

    await svc.signal(orgId, {
      endUserId,
      signalKey: "pc.inbox.a",
      mode: "set",
      count: 1,
    });
    await svc.signal(orgId, {
      endUserId,
      signalKey: "pc.inbox.b",
      mode: "set",
      count: 1,
    });

    let { nodes } = await svc.getTree(orgId, endUserId, leafKey);
    expect(nodes[0]!.count).toBe(2);

    await svc.signal(orgId, {
      endUserId,
      signalKey: "pc.inbox.a",
      mode: "clear",
    });
    ({ nodes } = await svc.getTree(orgId, endUserId, leafKey));
    expect(nodes[0]!.count).toBe(1);
  });

  // ─── Dismiss: manual ───────────────────────────────────────

  test("manual dismiss suppresses a lit node", async () => {
    const endUserId = newUser();
    const key = "dismiss.manual";

    await svc.createNode(orgId, {
      key,
      displayType: "dot",
      signalMatchMode: "exact",
      signalKey: "man.alert",
      aggregation: "none",
      dismissMode: "manual",
      sortOrder: 0,
      isEnabled: true,
    });

    await svc.signal(orgId, {
      endUserId,
      signalKey: "man.alert",
      mode: "set",
      count: 1,
    });

    let { nodes } = await svc.getTree(orgId, endUserId, key);
    expect(nodes[0]!.count).toBe(1);

    await svc.dismiss(orgId, endUserId, { nodeKey: key }, new Date());

    ({ nodes } = await svc.getTree(orgId, endUserId, key));
    expect(nodes[0]!.count).toBe(0);
  });

  // ─── Dismiss: version ──────────────────────────────────────

  test("version-mode dismiss relights when a new version arrives", async () => {
    const endUserId = newUser();
    const key = "dismiss.version";

    await svc.createNode(orgId, {
      key,
      displayType: "hot",
      signalMatchMode: "exact",
      signalKey: "ver.promo",
      aggregation: "none",
      dismissMode: "version",
      sortOrder: 0,
      isEnabled: true,
    });

    await svc.signal(orgId, {
      endUserId,
      signalKey: "ver.promo",
      mode: "set",
      count: 1,
      version: "v1",
    });
    await svc.dismiss(
      orgId,
      endUserId,
      { nodeKey: key, version: "v1" },
      new Date(),
    );

    let { nodes } = await svc.getTree(orgId, endUserId, key);
    expect(nodes[0]!.count).toBe(0);

    // Bump to v2 — signal row is updated in place with new version.
    await svc.signal(orgId, {
      endUserId,
      signalKey: "ver.promo",
      mode: "set",
      count: 1,
      version: "v2",
    });

    ({ nodes } = await svc.getTree(orgId, endUserId, key));
    expect(nodes[0]!.count).toBe(1);
  });

  // ─── Dismiss: cooldown ─────────────────────────────────────

  test("cooldown mode relights after elapsed seconds", async () => {
    const endUserId = newUser();
    const key = "dismiss.cooldown";

    await svc.createNode(orgId, {
      key,
      displayType: "exclamation",
      signalMatchMode: "exact",
      signalKey: "cd.alert",
      aggregation: "none",
      dismissMode: "cooldown",
      dismissConfig: { cooldownSec: 60 },
      sortOrder: 0,
      isEnabled: true,
    });

    await svc.signal(orgId, {
      endUserId,
      signalKey: "cd.alert",
      mode: "set",
      count: 1,
    });
    await svc.dismiss(orgId, endUserId, { nodeKey: key }, new Date());

    // Immediately: dismissed (suppressed)
    let { nodes } = await svc.getTree(orgId, endUserId, key);
    expect(nodes[0]!.count).toBe(0);

    // Backdate the dismissal row to 2 hours ago by direct DB update, so
    // the next read crosses the cooldown boundary.
    const earlier = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db
      .update(badgeDismissals)
      .set({ dismissedAt: earlier })
      .where(
        and(
          eq(badgeDismissals.organizationId, orgId),
          eq(badgeDismissals.endUserId, endUserId),
          eq(badgeDismissals.nodeKey, key),
        ),
      );

    ({ nodes } = await svc.getTree(orgId, endUserId, key));
    expect(nodes[0]!.count).toBe(1);
  });

  // ─── Dismiss: daily ────────────────────────────────────────

  test("daily-mode dismissal relights when periodKey differs", async () => {
    const endUserId = newUser();
    const key = "dismiss.daily";

    await svc.createNode(orgId, {
      key,
      displayType: "number",
      signalMatchMode: "exact",
      signalKey: "daily.quest",
      aggregation: "none",
      dismissMode: "daily",
      dismissConfig: { periodType: "daily", timezone: "UTC" },
      sortOrder: 0,
      isEnabled: true,
    });

    await svc.signal(orgId, {
      endUserId,
      signalKey: "daily.quest",
      mode: "set",
      count: 1,
    });
    const today = new Date();
    await svc.dismiss(orgId, endUserId, { nodeKey: key }, today);

    let { nodes } = await svc.getTree(orgId, endUserId, key);
    expect(nodes[0]!.count).toBe(0);

    // Simulate tomorrow by overwriting periodKey to a stale value.
    await db
      .update(badgeDismissals)
      .set({ periodKey: "1970-01-01" })
      .where(
        and(
          eq(badgeDismissals.organizationId, orgId),
          eq(badgeDismissals.endUserId, endUserId),
          eq(badgeDismissals.nodeKey, key),
        ),
      );

    ({ nodes } = await svc.getTree(orgId, endUserId, key));
    expect(nodes[0]!.count).toBe(1);
  });

  // ─── Reset session ─────────────────────────────────────────

  test("reset-session clears session-mode dismissals only", async () => {
    const endUserId = newUser();
    const sessionKey = "dismiss.session";
    const manualKey = "dismiss.session-sibling";

    await svc.createNode(orgId, {
      key: sessionKey,
      displayType: "dot",
      signalMatchMode: "exact",
      signalKey: "sess.a",
      aggregation: "none",
      dismissMode: "session",
      sortOrder: 0,
      isEnabled: true,
    });
    await svc.createNode(orgId, {
      key: manualKey,
      displayType: "dot",
      signalMatchMode: "exact",
      signalKey: "sess.b",
      aggregation: "none",
      dismissMode: "manual",
      sortOrder: 0,
      isEnabled: true,
    });

    await svc.signal(orgId, {
      endUserId,
      signalKey: "sess.a",
      mode: "set",
      count: 1,
    });
    await svc.signal(orgId, {
      endUserId,
      signalKey: "sess.b",
      mode: "set",
      count: 1,
    });

    await svc.dismiss(orgId, endUserId, { nodeKey: sessionKey }, new Date());
    await svc.dismiss(orgId, endUserId, { nodeKey: manualKey }, new Date());

    await svc.resetSession(orgId, endUserId);

    const sessionRows = await db
      .select()
      .from(badgeDismissals)
      .where(
        and(
          eq(badgeDismissals.organizationId, orgId),
          eq(badgeDismissals.endUserId, endUserId),
          inArray(badgeDismissals.nodeKey, [sessionKey, manualKey]),
        ),
      );
    // session-mode dismissal is gone; manual one still present.
    expect(sessionRows.find((r) => r.nodeKey === sessionKey)).toBeUndefined();
    expect(sessionRows.find((r) => r.nodeKey === manualKey)).toBeDefined();
  });

  // ─── Preview with explain ──────────────────────────────────

  test("preview with explain annotates every node with a reason", async () => {
    const endUserId = newUser();
    const key = "preview.root";

    await svc.createNode(orgId, {
      key,
      displayType: "gift",
      signalMatchMode: "exact",
      signalKey: "pv.reward",
      aggregation: "none",
      dismissMode: "auto",
      sortOrder: 0,
      isEnabled: true,
    });
    await svc.signal(orgId, {
      endUserId,
      signalKey: "pv.reward",
      mode: "set",
      count: 3,
    });

    const result = await svc.preview(orgId, endUserId, key, true);
    expect(result.nodes[0]!.count).toBe(3);
    expect(result.nodes[0]!.explain).toBeDefined();
    expect(result.nodes[0]!.explain!.reason).toMatch(/lit by/);
    expect(result.rawSignals.find((s) => s.signalKey === "pv.reward"))
      .toBeDefined();
  });

  // ─── Templates ─────────────────────────────────────────────

  test("from-template creates a node with the template defaults", async () => {
    const node = await svc.createFromTemplate(orgId, {
      templateId: "dynamic_list_number",
      key: "tpl.mail",
      signalKeyPrefix: "tpl.mail.",
    });
    expect(node.displayType).toBe("number");
    expect(node.aggregation).toBe("sum");
    expect(node.signalMatchMode).toBe("prefix");
    expect(node.signalKeyPrefix).toBe("tpl.mail.");
  });

  // ─── computePeriodKey sanity ───────────────────────────────

  test("computePeriodKey produces stable daily/weekly/monthly strings", () => {
    const d = new Date("2026-04-23T05:00:00Z");
    expect(computePeriodKey("daily", d, "UTC")).toBe("2026-04-23");
    expect(computePeriodKey("monthly", d, "UTC")).toBe("2026-04");
    expect(computePeriodKey("weekly", d, "UTC")).toMatch(/^2026-W\d{2}$/);
    expect(computePeriodKey("none", d, "UTC")).toBe("none");
  });
});
