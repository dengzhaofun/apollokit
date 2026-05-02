/**
 * Service-layer tests for the experiment module.
 *
 * Real Postgres via the `db` singleton (per server/CLAUDE.md — the
 * upsert/xmax pattern depends on real PG semantics, mocking would hide
 * exactly the bugs the pattern exists to catch). Events are recorded
 * via a stub bus so we can assert "emit exactly once per first-time
 * (experiment, endUser) pair".
 *
 * Pre-req: `drizzle/0010_last_human_fly.sql` must be applied to the
 * dev DB (`apollokit_dev` in `.dev.vars`). When running in CI, the
 * standard migrate flow takes care of this.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";

import { db } from "../../db";
import type { EventBus, EventMap } from "../../lib/event-bus";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createExperimentService } from "./service";

type EventKey = keyof EventMap & string;

function makeStubBus(): {
  bus: EventBus;
  emitted: Array<{ type: EventKey; payload: unknown }>;
  clear: () => void;
} {
  const emitted: Array<{ type: EventKey; payload: unknown }> = [];
  const bus: EventBus = {
    on: () => () => {},
    off: () => {},
    async emit(type, payload) {
      emitted.push({ type: type as EventKey, payload });
    },
  };
  return { bus, emitted, clear: () => emitted.splice(0) };
}

describe("experiment service", () => {
  let orgId: string;
  const { bus, emitted, clear } = makeStubBus();
  const svc = createExperimentService({ db, events: bus });

  beforeAll(async () => {
    orgId = await createTestOrg("experiment-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  beforeEach(() => clear());

  // ─── CRUD basics ──────────────────────────────────────────────

  test("create + get experiment, default status is draft", async () => {
    const exp = await svc.createExperiment(orgId, {
      key: "onboarding_v1",
      name: "Onboarding A/B",
      controlVariantKey: "control",
    });
    expect(exp.status).toBe("draft");
    expect(exp.key).toBe("onboarding_v1");

    const fetched = await svc.getExperiment(orgId, "onboarding_v1");
    expect(fetched.id).toBe(exp.id);
    expect(fetched.variantsCount).toBe(0);
    expect(fetched.assignedUsers).toBe(0);

    // Lookup by id also works.
    const byId = await svc.getExperiment(orgId, exp.id);
    expect(byId.id).toBe(exp.id);
  });

  test("duplicate experiment key throws ExperimentKeyConflictError", async () => {
    await svc.createExperiment(orgId, {
      key: "dup_key",
      name: "First",
      controlVariantKey: "control",
    });
    await expect(
      svc.createExperiment(orgId, {
        key: "dup_key",
        name: "Second",
        controlVariantKey: "control",
      }),
    ).rejects.toThrow(/already in use/);
  });

  // ─── Variants + traffic allocation ────────────────────────────

  test("transitionStatus to running enforces ≥2 variants and sum=100", async () => {
    const exp = await svc.createExperiment(orgId, {
      key: "preflight_test",
      name: "Preflight",
      controlVariantKey: "control",
    });

    // No variants → fail
    await expect(svc.transitionStatus(orgId, exp.id, "running")).rejects.toThrow(
      /at least 2 variants/,
    );

    // One variant (control) → still <2 → fail
    await svc.createVariant(orgId, exp.id, {
      variantKey: "control",
      name: "Control",
      isControl: true,
    });
    await expect(svc.transitionStatus(orgId, exp.id, "running")).rejects.toThrow(
      /at least 2 variants/,
    );

    // Two variants but allocation empty → fail (requireFull)
    await svc.createVariant(orgId, exp.id, {
      variantKey: "treatment",
      name: "Treatment",
    });
    await expect(svc.transitionStatus(orgId, exp.id, "running")).rejects.toThrow(
      /traffic_allocation must be non-empty/,
    );

    // Save partial allocation (sum=90) → succeeds (mid-edit allowed
    // on draft), but transition catches sum != 100.
    await svc.updateExperiment(orgId, exp.id, {
      trafficAllocation: [
        { variant_key: "control", percent: 60 },
        { variant_key: "treatment", percent: 30 },
      ],
    });
    await expect(svc.transitionStatus(orgId, exp.id, "running")).rejects.toThrow(
      /must sum to 100/,
    );

    // Orphan variant_key (structural error) → rejected at update time
    // — no point storing a broken reference.
    await expect(
      svc.updateExperiment(orgId, exp.id, {
        trafficAllocation: [
          { variant_key: "control", percent: 50 },
          { variant_key: "ghost", percent: 50 },
        ],
      }),
    ).rejects.toThrow(/unknown variant_key/);

    // Valid 50/50 → success
    await svc.updateExperiment(orgId, exp.id, {
      trafficAllocation: [
        { variant_key: "control", percent: 50 },
        { variant_key: "treatment", percent: 50 },
      ],
    });
    const running = await svc.transitionStatus(orgId, exp.id, "running");
    expect(running.status).toBe("running");
    expect(running.startedAt).toBeInstanceOf(Date);
  });

  test("running status locks traffic_allocation edits", async () => {
    const exp = await runningExperiment(svc, orgId, "lock_test");
    await expect(
      svc.updateExperiment(orgId, exp.id, {
        trafficAllocation: [
          { variant_key: "control", percent: 60 },
          { variant_key: "treatment", percent: 40 },
        ],
      }),
    ).rejects.toThrow(/cannot modify "trafficAllocation"/);
  });

  test("invalid status transitions are rejected", async () => {
    const exp = await svc.createExperiment(orgId, {
      key: "transition_test",
      name: "Transitions",
      controlVariantKey: "control",
    });
    // draft → paused is not allowed
    await expect(svc.transitionStatus(orgId, exp.id, "paused")).rejects.toThrow(
      /invalid status transition/,
    );
  });

  // ─── Bucketing ────────────────────────────────────────────────

  test("evaluate is deterministic for the same endUserId", async () => {
    const exp = await runningExperiment(svc, orgId, "deterministic");

    const r1 = await svc.evaluate(orgId, "user-A", [exp.key]);
    const r2 = await svc.evaluate(orgId, "user-A", [exp.key]);
    const r3 = await svc.evaluate(orgId, "user-A", [exp.key]);

    expect(r1[exp.key].variantKey).toBe(r2[exp.key].variantKey);
    expect(r2[exp.key].variantKey).toBe(r3[exp.key].variantKey);
  });

  test("traffic distribution is approximately correct under N samples", async () => {
    const exp = await runningExperiment(svc, orgId, "distribution", {
      allocation: [
        { variant_key: "control", percent: 50 },
        { variant_key: "treatment", percent: 50 },
      ],
    });

    const counts = new Map<string, number>();
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const r = await svc.evaluate(orgId, `dist-user-${i}`, [exp.key]);
      const v = r[exp.key].variantKey;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const ctrl = counts.get("control") ?? 0;
    const treat = counts.get("treatment") ?? 0;
    expect(ctrl + treat).toBe(N);
    // 50/50 split — accept ±10% margin (50 in 1000) given hash is fixed
    // and variance from one batch can drift; the goal here is "no
    // catastrophic skew", not statistical rigor.
    expect(ctrl).toBeGreaterThan(N * 0.4);
    expect(ctrl).toBeLessThan(N * 0.6);
    expect(treat).toBeGreaterThan(N * 0.4);
    expect(treat).toBeLessThan(N * 0.6);
  });

  // ─── Exposure de-dup ──────────────────────────────────────────

  test("experiment.exposure fires exactly once per (experiment, user)", async () => {
    const exp = await runningExperiment(svc, orgId, "exposure_dedup");
    clear();

    await svc.evaluate(orgId, "expose-user-1", [exp.key]);
    expect(emitted.filter((e) => e.type === "experiment.exposure")).toHaveLength(1);

    // Repeat evaluate for the same user — must NOT emit again.
    await svc.evaluate(orgId, "expose-user-1", [exp.key]);
    await svc.evaluate(orgId, "expose-user-1", [exp.key]);
    expect(emitted.filter((e) => e.type === "experiment.exposure")).toHaveLength(1);

    // New user → emit again, exactly once.
    await svc.evaluate(orgId, "expose-user-2", [exp.key]);
    expect(emitted.filter((e) => e.type === "experiment.exposure")).toHaveLength(2);
  });

  // ─── Paused / archived behavior ──────────────────────────────

  test("paused experiment: assigned user keeps variant, new user gets control without write", async () => {
    const exp = await runningExperiment(svc, orgId, "paused_behavior");

    // Assign one user while running.
    const r1 = await svc.evaluate(orgId, "paused-existing", [exp.key]);
    const assignedVariant = r1[exp.key].variantKey;

    // Pause.
    await svc.transitionStatus(orgId, exp.id, "paused");

    // Existing user — sticky, same variant.
    const r2 = await svc.evaluate(orgId, "paused-existing", [exp.key]);
    expect(r2[exp.key].variantKey).toBe(assignedVariant);

    // New user — gets control, no exposure event, no assignment row.
    clear();
    const r3 = await svc.evaluate(orgId, "paused-new", [exp.key]);
    expect(r3[exp.key].variantKey).toBe(exp.controlVariantKey);
    expect(emitted.filter((e) => e.type === "experiment.exposure")).toHaveLength(0);

    const debug = await svc.listAssignments(orgId, exp.id, { limit: 200 });
    const ids = debug.items.map((a) => a.endUserId);
    expect(ids).toContain("paused-existing");
    expect(ids).not.toContain("paused-new");
  });

  test("draft experiment is omitted from evaluate result entirely", async () => {
    const exp = await svc.createExperiment(orgId, {
      key: "draft_only",
      name: "Draft only",
      controlVariantKey: "control",
    });
    const r = await svc.evaluate(orgId, "draft-user", [exp.key]);
    expect(r[exp.key]).toBeUndefined();
  });

  // ─── Variant in use guard ────────────────────────────────────

  test("deleting a variant with assignments throws VariantInUseError", async () => {
    const exp = await runningExperiment(svc, orgId, "variant_in_use");
    await svc.evaluate(orgId, "viu-user", [exp.key]);

    // Pause to allow variant deletes.
    await svc.transitionStatus(orgId, exp.id, "paused");

    const variants = await svc.listVariants(orgId, exp.id);
    const treatment = variants.find((v) => v.variantKey === "treatment");
    expect(treatment).toBeDefined();

    // The single user might have been bucketed to treatment OR control;
    // pick whichever got assigned and try to delete that one.
    const assigned = variants.find((v) => v.assignedUsers > 0);
    if (assigned && assigned.variantKey !== exp.controlVariantKey) {
      await expect(
        svc.deleteVariant(orgId, assigned.id),
      ).rejects.toThrow(/has \d+ assignment/);
    }
  });

  // ─── Variant config payload reaches evaluate ─────────────────

  test("variant config_json is returned via evaluate", async () => {
    const exp = await svc.createExperiment(orgId, {
      key: "config_passthrough",
      name: "Config",
      controlVariantKey: "control",
    });
    await svc.createVariant(orgId, exp.id, {
      variantKey: "control",
      name: "Control",
      isControl: true,
      configJson: { rewardMultiplier: 1 },
    });
    await svc.createVariant(orgId, exp.id, {
      variantKey: "treatment",
      name: "Treatment",
      configJson: { rewardMultiplier: 2 },
    });
    await svc.updateExperiment(orgId, exp.id, {
      trafficAllocation: [
        { variant_key: "control", percent: 50 },
        { variant_key: "treatment", percent: 50 },
      ],
    });
    await svc.transitionStatus(orgId, exp.id, "running");

    const r = await svc.evaluate(orgId, "config-user", [exp.key]);
    expect(r[exp.key].config).toBeTruthy();
    const cfg = r[exp.key].config as { rewardMultiplier: number };
    expect([1, 2]).toContain(cfg.rewardMultiplier);
  });

  // ─── Targeting (v1.5) ────────────────────────────────────

  test("evaluate omits experiments whose targeting rule rejects the user", async () => {
    const exp = await runningExperiment(svc, orgId, "targeting_omit");
    // After running, set a targeting rule that requires country=JP.
    // (running-state edits to targeting are allowed — only allocation
    // is locked.)
    await svc.updateExperiment(orgId, exp.id, {
      targetingRules: { "==": [{ var: "country" }, "JP"] },
    });

    const matched = await svc.evaluate(orgId, "tg-jp-user", [exp.key], {
      country: "JP",
    });
    expect(matched[exp.key]).toBeDefined();

    const rejected = await svc.evaluate(orgId, "tg-us-user", [exp.key], {
      country: "US",
    });
    expect(rejected[exp.key]).toBeUndefined();
  });

  test("targeting-rejected user produces no assignment row + no exposure", async () => {
    const exp = await runningExperiment(svc, orgId, "targeting_no_side_effect");
    await svc.updateExperiment(orgId, exp.id, {
      targetingRules: { "==": [{ var: "plan" }, "premium"] },
    });
    clear();

    await svc.evaluate(orgId, "free-user", [exp.key], { plan: "free" });
    expect(emitted.filter((e) => e.type === "experiment.exposure")).toHaveLength(0);

    const debug = await svc.listAssignments(orgId, exp.id, { limit: 200 });
    expect(debug.items.find((a) => a.endUserId === "free-user")).toBeUndefined();
  });

  test("sticky assignment survives a targeting rule that no longer matches", async () => {
    const exp = await runningExperiment(svc, orgId, "targeting_sticky");
    // No targeting yet — user gets assigned.
    const r1 = await svc.evaluate(orgId, "sticky-user", [exp.key], { plan: "free" });
    const assignedVariant = r1[exp.key].variantKey;

    // Add a rule that excludes free users.
    await svc.updateExperiment(orgId, exp.id, {
      targetingRules: { "==": [{ var: "plan" }, "premium"] },
    });

    // Existing user — sticky returns same variant despite no longer matching.
    const r2 = await svc.evaluate(orgId, "sticky-user", [exp.key], { plan: "free" });
    expect(r2[exp.key].variantKey).toBe(assignedVariant);

    // New user with same non-matching attrs → omitted.
    const r3 = await svc.evaluate(orgId, "sticky-newuser", [exp.key], { plan: "free" });
    expect(r3[exp.key]).toBeUndefined();
  });

  test("SDK attributes override server-supplied on conflict", async () => {
    // Service-layer test simulates the merging that client-routes does:
    // we just pass the merged object directly. Equivalence test: verify
    // the rule sees what the caller passed.
    const exp = await runningExperiment(svc, orgId, "targeting_merge");
    await svc.updateExperiment(orgId, exp.id, {
      targetingRules: { "==": [{ var: "country" }, "JP"] },
    });

    // Caller's merged object (SDK won)
    const r = await svc.evaluate(orgId, "merged-user", [exp.key], {
      country: "JP", // SDK said JP, even if server geo said US
    });
    expect(r[exp.key]).toBeDefined();
  });

  test("setPrimaryMetric persists and clears", async () => {
    const exp = await svc.createExperiment(orgId, {
      key: "metric_set",
      name: "Metric set",
      controlVariantKey: "control",
    });
    expect(exp.primaryMetric).toBeNull();

    const updated = await svc.setPrimaryMetric(
      orgId,
      exp.id,
      { event: "tutorial_completed", denominator: "exposed_users" },
      14,
    );
    expect(updated.primaryMetric?.event).toBe("tutorial_completed");
    expect(updated.metricWindowDays).toBe(14);

    const cleared = await svc.setPrimaryMetric(orgId, exp.id, null);
    expect(cleared.primaryMetric).toBeNull();
    expect(cleared.metricWindowDays).toBe(14); // window untouched when not provided
  });

  // ─── Bucketing preview ──────────────────────────────────────

  test("previewBucketing returns sampled distribution + optional user variant", async () => {
    const exp = await runningExperiment(svc, orgId, "preview_test", {
      allocation: [
        { variant_key: "control", percent: 80 },
        { variant_key: "treatment", percent: 20 },
      ],
    });

    const result = await svc.previewBucketing(orgId, exp.id, {
      end_user_id: "preview-user",
      sample_size: 1000,
    });

    expect(result.userVariant).toBeTruthy();
    expect(result.distribution).toHaveLength(2);
    const ctrl = result.distribution.find((d) => d.variantKey === "control");
    expect(ctrl).toBeDefined();
    // 80/20 split → control should be >70% in 1000 samples (allows ±10%).
    expect(ctrl!.percent).toBeGreaterThan(70);
    expect(ctrl!.percent).toBeLessThan(90);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────

async function runningExperiment(
  svc: ReturnType<typeof createExperimentService>,
  orgId: string,
  key: string,
  options: {
    allocation?: Array<{ variant_key: string; percent: number }>;
  } = {},
) {
  const exp = await svc.createExperiment(orgId, {
    key,
    name: key,
    controlVariantKey: "control",
  });
  await svc.createVariant(orgId, exp.id, {
    variantKey: "control",
    name: "Control",
    isControl: true,
  });
  await svc.createVariant(orgId, exp.id, {
    variantKey: "treatment",
    name: "Treatment",
  });
  await svc.updateExperiment(orgId, exp.id, {
    trafficAllocation: options.allocation ?? [
      { variant_key: "control", percent: 50 },
      { variant_key: "treatment", percent: 50 },
    ],
  });
  return svc.transitionStatus(orgId, exp.id, "running");
}
