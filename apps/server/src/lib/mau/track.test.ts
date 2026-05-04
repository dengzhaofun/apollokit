/**
 * Service-layer tests for the MAU tracker. Talks to the real Neon
 * dev branch configured in `.dev.vars`. The KV is stubbed in
 * memory because the production tracker uses ArrayBuffer mode and
 * the global vitest shim only models string mode.
 */
import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { euUser, mauActivePlayer } from "../../schema";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import type { MauKv } from "./track";
import { trackMauActivity } from "./track";

interface KVEntry {
  buf: ArrayBuffer;
  expiresAt: number | null;
}

class MemoryKv implements MauKv {
  store = new Map<string, KVEntry>();
  reads = 0;
  writes = 0;
  failNextRead = false;
  failNextWrite = false;

  async get(key: string): Promise<ArrayBuffer | null> {
    this.reads++;
    if (this.failNextRead) {
      this.failNextRead = false;
      throw new Error("simulated KV read failure");
    }
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.buf;
  }

  async put(
    key: string,
    value: ArrayBuffer,
    options?: { expirationTtl?: number },
  ): Promise<void> {
    this.writes++;
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error("simulated KV write failure");
    }
    const ttl = options?.expirationTtl;
    this.store.set(key, {
      buf: value,
      expiresAt: typeof ttl === "number" ? Date.now() + ttl * 1000 : null,
    });
  }
}

async function seedEuUser(opts: {
  id: string;
  tenantId: string;
}) {
  await db.insert(euUser).values({
    id: opts.id,
    name: opts.id,
    email: `${opts.id}@${opts.tenantId}.test`,
    tenantId: opts.tenantId,
  });
}

async function countActivePlayers(teamId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(mauActivePlayer)
    .where(eq(mauActivePlayer.teamId, teamId));
  return row?.c ?? 0;
}

describe("mau tracker", () => {
  let teamId: string;
  let euA: string;
  let euB: string;

  beforeAll(async () => {
    teamId = await createTestOrg("mau-track");
    euA = `eu-${crypto.randomUUID()}`;
    euB = `eu-${crypto.randomUUID()}`;
    await seedEuUser({ id: euA, tenantId: teamId });
    await seedEuUser({ id: euB, tenantId: teamId });
  });

  afterAll(async () => {
    await deleteTestOrg(teamId);
  });

  test("first activation inserts a row and sets bloom", async () => {
    const kv = new MemoryKv();
    const may = new Date(Date.UTC(2026, 4, 15));
    const outcome = await trackMauActivity({
      kv,
      db,
      teamId,
      euUserId: euA,
      now: may,
    });
    expect(outcome).toBe("inserted");
    expect(kv.writes).toBe(1);
    expect(kv.store.size).toBe(1);
    const [row] = await db
      .select()
      .from(mauActivePlayer)
      .where(
        and(
          eq(mauActivePlayer.teamId, teamId),
          eq(mauActivePlayer.euUserId, euA),
          eq(mauActivePlayer.yearMonth, "2026-05"),
        ),
      );
    expect(row).toBeDefined();
  });

  test("repeat activation in same month is bloom-skipped (no extra PG row)", async () => {
    const kv = new MemoryKv();
    const may = new Date(Date.UTC(2026, 4, 15));
    await trackMauActivity({ kv, db, teamId, euUserId: euA, now: may });
    const before = await countActivePlayers(teamId);
    const writesBefore = kv.writes;
    const outcome = await trackMauActivity({
      kv,
      db,
      teamId,
      euUserId: euA,
      now: may,
    });
    expect(outcome).toBe("skipped_bloom_hit");
    expect(kv.writes).toBe(writesBefore); // no new write needed
    const after = await countActivePlayers(teamId);
    expect(after).toBe(before);
  });

  test("different player in same month creates separate row, shares bloom key", async () => {
    const kv = new MemoryKv();
    const may = new Date(Date.UTC(2026, 4, 15));
    await trackMauActivity({ kv, db, teamId, euUserId: euA, now: may });
    const r = await trackMauActivity({
      kv,
      db,
      teamId,
      euUserId: euB,
      now: may,
    });
    expect(r).toBe("inserted");
    // Same month → same bloom key.
    expect(kv.store.size).toBe(1);
    // Both rows visible in PG for that month.
    const [row] = await db
      .select({ c: count() })
      .from(mauActivePlayer)
      .where(
        and(
          eq(mauActivePlayer.teamId, teamId),
          eq(mauActivePlayer.yearMonth, "2026-05"),
        ),
      );
    expect(row?.c).toBeGreaterThanOrEqual(2);
  });

  test("crossing into next month creates a new row + new bloom key", async () => {
    const kv = new MemoryKv();
    const may = new Date(Date.UTC(2026, 4, 20));
    const june = new Date(Date.UTC(2026, 5, 1));
    await trackMauActivity({ kv, db, teamId, euUserId: euA, now: may });
    const r = await trackMauActivity({
      kv,
      db,
      teamId,
      euUserId: euA,
      now: june,
    });
    expect(r).toBe("inserted");
    expect(kv.store.size).toBe(2);
    const [row] = await db
      .select()
      .from(mauActivePlayer)
      .where(
        and(
          eq(mauActivePlayer.teamId, teamId),
          eq(mauActivePlayer.euUserId, euA),
          eq(mauActivePlayer.yearMonth, "2026-06"),
        ),
      );
    expect(row).toBeDefined();
  });

  test("KV read failure still inserts (degrades to PG-only)", async () => {
    const kv = new MemoryKv();
    kv.failNextRead = true;
    const may = new Date(Date.UTC(2026, 4, 18));
    const outcome = await trackMauActivity({
      kv,
      db,
      teamId,
      euUserId: euA,
      now: may,
    });
    // Either a fresh insert OR (more likely, given prior tests in the
    // same order) a no-op since the row from the first test still
    // exists. We only require: did NOT get the bloom-hit early return.
    expect(outcome).not.toBe("skipped_bloom_hit");
  });

  test("KV write failure does not surface as an error", async () => {
    const kv = new MemoryKv();
    kv.failNextWrite = true;
    // Use a fresh player id so we definitely take the insert path.
    const fresh = `eu-${crypto.randomUUID()}`;
    await seedEuUser({ id: fresh, tenantId: teamId });
    const may = new Date(Date.UTC(2026, 4, 18));
    await expect(
      trackMauActivity({
        kv,
        db,
        teamId,
        euUserId: fresh,
        now: may,
      }),
    ).resolves.toBe("inserted");
  });
});
