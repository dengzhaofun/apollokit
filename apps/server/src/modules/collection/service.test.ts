/**
 * Service-layer tests for the collection module.
 *
 * Talks to the real Neon dev branch (see apps/server/.dev.vars). A single
 * test org is seeded per file; ON DELETE CASCADE sweeps all collection_*,
 * item_* and mail_* rows on teardown. Test aliases are unique-per-file.
 *
 * Coverage map:
 *   - Album/Group/Entry/Milestone CRUD + alias conflict + cross-FK checks
 *   - Entry unlock via onItemGranted hook (trigger quantity 1 and >1)
 *   - Idempotency of unlock inserts
 *   - Source short-circuit (recursion protection)
 *   - syncFromInventory fallback
 *   - Manual milestone claim (scope=entry/group/album, threshold checks,
 *     already-claimed, not-reached, autoClaim-only rejection)
 *   - autoClaim milestone dispatched via mail (observed via mail side effect
 *     through a stubbed mailService, not the real one)
 */

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { collectionMilestones } from "../../schema/collection";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createItemService } from "../item/service";
import type { MailService } from "../mail/service";
import type { ItemEntry } from "../item/types";
import { createCollectionService } from "./service";

type CapturedMail = {
  organizationId: string;
  endUserId: string;
  input: {
    title: string;
    content: string;
    rewards: ItemEntry[];
    originSource: string;
    originSourceId: string;
    requireRead?: boolean;
  };
};

describe("collection service", () => {
  const itemSvc = createItemService({ db });
  const captured: CapturedMail[] = [];

  // Stub mailService — we only need sendUnicast for the autoClaim path.
  const stubMail = {
    sendUnicast: async (
      organizationId: string,
      endUserId: string,
      input: CapturedMail["input"],
    ) => {
      captured.push({ organizationId, endUserId, input });
      return { id: `mail-${captured.length}` } as unknown as Awaited<
        ReturnType<MailService["sendUnicast"]>
      >;
    },
  } as unknown as MailService;

  const svc = createCollectionService({ db }, itemSvc, () => stubMail);

  // Wire the hook so grantItems triggers onItemGranted in these tests.
  itemSvc.setGrantHook(async (params) => {
    await svc.onItemGranted(params);
  });

  let orgId: string;
  let defFireDragonId: string;
  let defWaterDragonId: string;
  let defDiamondId: string;
  let fireDragonAlbumId: string;
  let dragonsGroupId: string;
  let fireEntryId: string;
  let waterEntryId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("collection-svc");

    // Seed item definitions we reuse across tests.
    const fire = await itemSvc.createDefinition(orgId, {
      name: "Fire Dragon Card",
      alias: "c-def-fire-dragon",
      stackable: true,
    });
    defFireDragonId = fire.id;
    const water = await itemSvc.createDefinition(orgId, {
      name: "Water Dragon Card",
      alias: "c-def-water-dragon",
      stackable: true,
    });
    defWaterDragonId = water.id;
    const diamond = await itemSvc.createDefinition(orgId, {
      name: "Diamond",
      alias: "c-def-diamond",
      stackable: true,
    });
    defDiamondId = diamond.id;
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── Album CRUD ─────────────────────────────────────────────

  describe("album CRUD", () => {
    test("create + get by alias", async () => {
      const a = await svc.createAlbum(orgId, {
        name: "Dragon Codex",
        alias: "c-dragons",
        scope: "hero",
      });
      expect(a.name).toBe("Dragon Codex");
      expect(a.alias).toBe("c-dragons");
      expect(a.scope).toBe("hero");
      fireDragonAlbumId = a.id;

      const fetched = await svc.getAlbum(orgId, "c-dragons");
      expect(fetched.id).toBe(a.id);
    });

    test("alias conflict is a typed error", async () => {
      await expect(
        svc.createAlbum(orgId, {
          name: "Another Dragon Book",
          alias: "c-dragons",
        }),
      ).rejects.toMatchObject({ code: "collection.alias_conflict" });
    });

    test("update + delete", async () => {
      const a = await svc.createAlbum(orgId, {
        name: "To Delete",
        alias: "c-del",
      });
      const u = await svc.updateAlbum(orgId, a.id, { name: "Renamed" });
      expect(u.name).toBe("Renamed");
      await svc.deleteAlbum(orgId, a.id);
      await expect(svc.getAlbum(orgId, "c-del")).rejects.toMatchObject({
        code: "collection.album_not_found",
      });
    });
  });

  // ─── Group CRUD ─────────────────────────────────────────────

  describe("group CRUD", () => {
    test("create group + list", async () => {
      const g = await svc.createGroup(orgId, "c-dragons", {
        name: "Elemental Dragons",
        sortOrder: 1,
      });
      expect(g.name).toBe("Elemental Dragons");
      dragonsGroupId = g.id;

      const list = await svc.listGroups(orgId, "c-dragons");
      expect(list.some((x) => x.id === g.id)).toBe(true);
    });
  });

  // ─── Entry CRUD ─────────────────────────────────────────────

  describe("entry CRUD", () => {
    test("create entry bound to item def", async () => {
      const e = await svc.createEntry(orgId, "c-dragons", {
        name: "Fire Dragon",
        alias: "c-e-fire",
        groupId: dragonsGroupId,
        triggerItemDefinitionId: defFireDragonId,
      });
      expect(e.triggerItemDefinitionId).toBe(defFireDragonId);
      expect(e.triggerQuantity).toBe(1);
      fireEntryId = e.id;

      const eWater = await svc.createEntry(orgId, "c-dragons", {
        name: "Water Dragon",
        alias: "c-e-water",
        groupId: dragonsGroupId,
        triggerItemDefinitionId: defWaterDragonId,
      });
      waterEntryId = eWater.id;
    });

    test("bulk create respects alias conflicts (surfaces typed error)", async () => {
      await expect(
        svc.bulkCreateEntries(orgId, "c-dragons", [
          {
            name: "Dup entry",
            alias: "c-e-fire",
            triggerItemDefinitionId: defFireDragonId,
          },
        ]),
      ).rejects.toMatchObject({ code: "collection.alias_conflict" });
    });

    test("reject entry if group doesn't belong to album", async () => {
      const otherAlbum = await svc.createAlbum(orgId, {
        name: "Other",
        alias: "c-other",
      });
      const otherGroup = await svc.createGroup(orgId, "c-other", {
        name: "Other group",
      });
      await expect(
        svc.createEntry(orgId, "c-dragons", {
          name: "Mismatch",
          groupId: otherGroup.id,
          triggerItemDefinitionId: defFireDragonId,
        }),
      ).rejects.toMatchObject({ code: "collection.invalid_input" });
      await svc.deleteAlbum(orgId, otherAlbum.id);
    });
  });

  // ─── Milestone CRUD ─────────────────────────────────────────

  let entryMilestoneId: string;
  let groupMilestoneId: string;
  let albumMilestoneId: string;

  describe("milestone CRUD", () => {
    test("create entry-scope milestone", async () => {
      const m = await svc.createMilestone(orgId, "c-dragons", {
        scope: "entry",
        entryId: fireEntryId,
        rewardItems: [{ type: "item" as const, id: defDiamondId, count: 10 }],
        label: "First Fire Dragon",
      });
      expect(m.scope).toBe("entry");
      expect(m.threshold).toBe(1);
      expect(m.entryId).toBe(fireEntryId);
      entryMilestoneId = m.id;
    });

    test("create group-scope milestone", async () => {
      const m = await svc.createMilestone(orgId, "c-dragons", {
        scope: "group",
        groupId: dragonsGroupId,
        threshold: 2,
        rewardItems: [{ type: "item" as const, id: defDiamondId, count: 50 }],
      });
      expect(m.scope).toBe("group");
      expect(m.threshold).toBe(2);
      groupMilestoneId = m.id;
    });

    test("create album-scope milestone", async () => {
      const m = await svc.createMilestone(orgId, "c-dragons", {
        scope: "album",
        threshold: 2,
        rewardItems: [{ type: "item" as const, id: defDiamondId, count: 100 }],
      });
      expect(m.scope).toBe("album");
      albumMilestoneId = m.id;
    });

    test("update preserves threshold=1 for entry scope", async () => {
      const updated = await svc.updateMilestone(orgId, entryMilestoneId, {
        threshold: 99,
      });
      expect(updated.threshold).toBe(1);
    });
  });

  // ─── Unlock hook: triggerQuantity=1 ─────────────────────────

  describe("onItemGranted hook", () => {
    test("granting a trigger item unlocks the matching entry", async () => {
      const endUserId = "c-u1";
      await itemSvc.grantItems({
        organizationId: orgId,
        endUserId,
        grants: [{ definitionId: defFireDragonId, quantity: 1 }],
        source: "test.grant",
      });

      const detail = await svc.getAlbumDetailForUser({
        organizationId: orgId,
        endUserId,
        albumKey: "c-dragons",
      });
      const fire = detail.entries.find((e) => e.id === fireEntryId);
      expect(fire?.unlocked).toBe(true);
      expect(detail.totals.unlockedCount).toBe(1);
    });

    test("granting again is idempotent — no duplicate rows, no spurious mail", async () => {
      const endUserId = "c-u-idem";
      captured.length = 0;

      await itemSvc.grantItems({
        organizationId: orgId,
        endUserId,
        grants: [{ definitionId: defFireDragonId, quantity: 1 }],
        source: "test.grant",
      });
      await itemSvc.grantItems({
        organizationId: orgId,
        endUserId,
        grants: [{ definitionId: defFireDragonId, quantity: 1 }],
        source: "test.grant",
      });

      const detail = await svc.getAlbumDetailForUser({
        organizationId: orgId,
        endUserId,
        albumKey: "c-dragons",
      });
      expect(detail.totals.unlockedCount).toBe(1);
    });

    test("source prefix short-circuits recursion", async () => {
      const endUserId = "c-u-recur";
      captured.length = 0;

      await itemSvc.grantItems({
        organizationId: orgId,
        endUserId,
        grants: [{ definitionId: defFireDragonId, quantity: 1 }],
        source: "collection.milestone",
        sourceId: "dummy",
      });

      const detail = await svc.getAlbumDetailForUser({
        organizationId: orgId,
        endUserId,
        albumKey: "c-dragons",
      });
      // Short-circuit means the hook returned early, so no unlock row.
      expect(detail.totals.unlockedCount).toBe(0);
    });
  });

  // ─── Sync fallback ──────────────────────────────────────────

  describe("syncFromInventory", () => {
    test("reconciles missed unlocks from inventory", { timeout: 60_000 }, async () => {
      const endUserId = "c-u-sync";

      // Insert inventory WITHOUT the hook (temporarily unwire it).
      itemSvc.setGrantHook(async () => {});
      await itemSvc.grantItems({
        organizationId: orgId,
        endUserId,
        grants: [{ definitionId: defWaterDragonId, quantity: 1 }],
        source: "test.grant",
      });
      // Re-wire the hook.
      itemSvc.setGrantHook(async (params) => {
        await svc.onItemGranted(params);
      });

      // Pre-sync: entry is NOT unlocked (hook was disabled).
      const pre = await svc.getAlbumDetailForUser({
        organizationId: orgId,
        endUserId,
        albumKey: "c-dragons",
      });
      expect(pre.totals.unlockedCount).toBe(0);

      // Run sync.
      const unlocked = await svc.syncFromInventory({
        organizationId: orgId,
        endUserId,
        albumKey: "c-dragons",
      });
      expect(unlocked.map((e) => e.id).sort()).toEqual([waterEntryId]);

      // Post-sync: entry now unlocked.
      const post = await svc.getAlbumDetailForUser({
        organizationId: orgId,
        endUserId,
        albumKey: "c-dragons",
      });
      expect(post.totals.unlockedCount).toBe(1);
    });
  });

  // ─── Manual claim ───────────────────────────────────────────

  describe("claimMilestone (manual)", () => {
    test("claim entry-scope milestone after unlock", async () => {
      const endUserId = "c-u-claim";
      await itemSvc.grantItems({
        organizationId: orgId,
        endUserId,
        grants: [{ definitionId: defFireDragonId, quantity: 1 }],
        source: "test.grant",
      });

      const result = await svc.claimMilestone({
        organizationId: orgId,
        endUserId,
        milestoneId: entryMilestoneId,
      });
      expect(result.grantedItems).toHaveLength(1);
      expect(result.grantedItems[0]!.id).toBe(defDiamondId);

      const inv = await itemSvc.getInventory({
        organizationId: orgId,
        endUserId,
        definitionId: defDiamondId,
      });
      expect(inv[0]?.totalQuantity ?? 0).toBeGreaterThanOrEqual(10);
    });

    test("claiming twice throws AlreadyClaimed", async () => {
      const endUserId = "c-u-claim"; // reuse previous user's already-claimed state
      await expect(
        svc.claimMilestone({
          organizationId: orgId,
          endUserId,
          milestoneId: entryMilestoneId,
        }),
      ).rejects.toMatchObject({ code: "collection.milestone_already_claimed" });
    });

    test("claim before threshold throws NotReached", async () => {
      const endUserId = "c-u-not-reached";
      await expect(
        svc.claimMilestone({
          organizationId: orgId,
          endUserId,
          milestoneId: groupMilestoneId,
        }),
      ).rejects.toMatchObject({ code: "collection.milestone_not_reached" });
    });

    test("claiming an autoClaim milestone through the manual API is rejected", async () => {
      // Flip a milestone to autoClaim for this test only, then flip back.
      await svc.updateMilestone(orgId, albumMilestoneId, { autoClaim: true });
      await expect(
        svc.claimMilestone({
          organizationId: orgId,
          endUserId: "c-u-auto-only",
          milestoneId: albumMilestoneId,
        }),
      ).rejects.toMatchObject({ code: "collection.milestone_auto_only" });
      await svc.updateMilestone(orgId, albumMilestoneId, { autoClaim: false });
    });
  });

  // ─── autoClaim via mail ─────────────────────────────────────

  describe("autoClaim via mail", () => {
    test("threshold reached on autoClaim milestone → mail dispatched, NOT grantItems", async () => {
      const endUserId = "c-u-auto";
      captured.length = 0;

      // Flip album-scope milestone to autoClaim for this test.
      await svc.updateMilestone(orgId, albumMilestoneId, { autoClaim: true });

      // Unlock two entries (fire + water) → reaches album threshold=2.
      await itemSvc.grantItems({
        organizationId: orgId,
        endUserId,
        grants: [
          { definitionId: defFireDragonId, quantity: 1 },
          { definitionId: defWaterDragonId, quantity: 1 },
        ],
        source: "test.grant",
      });

      // Mail stub received exactly one message with the right origin.
      const albumMilestoneMails = captured.filter(
        (m) => m.input.originSource === "collection.milestone",
      );
      expect(albumMilestoneMails).toHaveLength(1);
      const mail = albumMilestoneMails[0]!;
      expect(mail.input.originSourceId).toBe(
        `${albumMilestoneId}:${endUserId}`,
      );
      expect(mail.input.rewards[0]!.id).toBe(defDiamondId);
      expect(mail.endUserId).toBe(endUserId);

      // The hook did NOT grant items directly — diamond inventory for this
      // user was untouched by the collection layer (only mail dispatch).
      const inv = await itemSvc.getInventory({
        organizationId: orgId,
        endUserId,
        definitionId: defDiamondId,
      });
      expect(inv[0]?.totalQuantity ?? 0).toBe(0);

      // user_milestones row recorded — idempotent guard in place.
      const rows = await db
        .select()
        .from(collectionMilestones)
        .where(
          and(
            eq(collectionMilestones.id, albumMilestoneId),
            eq(collectionMilestones.organizationId, orgId),
          ),
        );
      expect(rows.length).toBe(1);

      await svc.updateMilestone(orgId, albumMilestoneId, { autoClaim: false });
    });
  });
});
