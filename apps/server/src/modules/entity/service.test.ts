/**
 * Service-layer tests for the entity module — Phase 1 (CRUD).
 *
 * Talks to the real Neon dev branch (see apps/server/.dev.vars).
 * A single test org is seeded per file; ON DELETE CASCADE sweeps
 * all entity_* rows on teardown.
 *
 * Coverage map:
 *   - Schema CRUD (create, list, get by id/alias, update, delete, alias conflict)
 *   - Blueprint CRUD (create, list, filter by schemaId, get, update, delete, alias conflict)
 *   - Skin CRUD (create, list, get, update, delete, alias conflict)
 *   - FormationConfig CRUD (create, list, get, update, delete, alias conflict)
 *   - Cross-FK validation (blueprint requires valid schemaId, skin requires valid blueprintId)
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createItemService } from "../item/service";
import { createEntityService } from "./service";

describe("entity service — Phase 1 CRUD", () => {
  const svc = createEntityService({ db });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("entity-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ═══════════════════════════════════════════════════════════════
  // Schema CRUD
  // ═══════════════════════════════════════════════════════════════

  let heroSchemaId: string;
  let weaponSchemaId: string;

  test("createSchema — hero", async () => {
    const row = await svc.createSchema(orgId, {
      name: "英雄",
      alias: "hero",
      statDefinitions: [
        { key: "hp", label: "HP", type: "integer", defaultValue: 0 },
        { key: "atk", label: "ATK", type: "integer", defaultValue: 0 },
      ],
      tagDefinitions: [
        { key: "class", label: "Class", values: ["warrior", "mage"] },
      ],
      slotDefinitions: [
        {
          key: "weapon",
          label: "Weapon",
          acceptsSchemaIds: [],
          maxCount: 1,
        },
      ],
      levelConfig: { enabled: true, maxLevel: 60 },
      rankConfig: {
        enabled: true,
        ranks: [
          { key: "N", label: "Normal", order: 0 },
          { key: "R", label: "Rare", order: 1 },
        ],
      },
      synthesisConfig: { enabled: true, sameBlueprint: true, inputCount: 3 },
    });

    expect(row.id).toBeDefined();
    expect(row.name).toBe("英雄");
    expect(row.alias).toBe("hero");
    expect(row.statDefinitions).toHaveLength(2);
    expect(row.levelConfig.maxLevel).toBe(60);
    heroSchemaId = row.id;
  });

  test("createSchema — weapon", async () => {
    const row = await svc.createSchema(orgId, {
      name: "武器",
      alias: "weapon",
      statDefinitions: [
        { key: "atk", label: "ATK", type: "integer", defaultValue: 0 },
      ],
      levelConfig: { enabled: true, maxLevel: 30 },
    });

    expect(row.name).toBe("武器");
    weaponSchemaId = row.id;
  });

  test("createSchema — alias conflict", async () => {
    await expect(
      svc.createSchema(orgId, { name: "Duplicate", alias: "hero" }),
    ).rejects.toThrow("alias already in use");
  });

  test("listSchemas", async () => {
    const rows = await svc.listSchemas(orgId);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const names = rows.map((r) => r.name);
    expect(names).toContain("英雄");
    expect(names).toContain("武器");
  });

  test("getSchema — by id", async () => {
    const row = await svc.getSchema(orgId, heroSchemaId);
    expect(row.name).toBe("英雄");
  });

  test("getSchema — by alias", async () => {
    const row = await svc.getSchema(orgId, "hero");
    expect(row.id).toBe(heroSchemaId);
  });

  test("getSchema — not found", async () => {
    await expect(
      svc.getSchema(orgId, "nonexistent"),
    ).rejects.toThrow("not found");
  });

  test("updateSchema", async () => {
    const row = await svc.updateSchema(orgId, heroSchemaId, {
      name: "英雄V2",
      levelConfig: { enabled: true, maxLevel: 80 },
    });
    expect(row.name).toBe("英雄V2");
    expect(row.levelConfig.maxLevel).toBe(80);
    // restore
    await svc.updateSchema(orgId, heroSchemaId, { name: "英雄" });
  });

  test("updateSchema — no-op returns existing", async () => {
    const row = await svc.updateSchema(orgId, heroSchemaId, {});
    expect(row.name).toBe("英雄");
  });

  // ═══════════════════════════════════════════════════════════════
  // Blueprint CRUD
  // ═══════════════════════════════════════════════════════════════

  let fireWarriorBpId: string;
  let iceMageBpId: string;
  let flameSwordBpId: string;

  test("createBlueprint — fire warrior hero", async () => {
    const row = await svc.createBlueprint(orgId, {
      schemaId: heroSchemaId,
      name: "火龙战士",
      alias: "fire-warrior",
      rarity: "SSR",
      tags: { class: "warrior" },
      assets: { icon: "https://cdn.example.com/fire-warrior.png" },
      baseStats: { hp: 1200, atk: 85 },
      statGrowth: { hp: 120, atk: 8 },
    });

    expect(row.name).toBe("火龙战士");
    expect(row.rarity).toBe("SSR");
    expect(row.tags).toEqual({ class: "warrior" });
    expect(row.baseStats).toEqual({ hp: 1200, atk: 85 });
    fireWarriorBpId = row.id;
  });

  test("createBlueprint — ice mage hero", async () => {
    const row = await svc.createBlueprint(orgId, {
      schemaId: heroSchemaId,
      name: "冰霜法师",
      alias: "ice-mage",
      rarity: "SR",
      tags: { class: "mage" },
      baseStats: { hp: 800, atk: 30 },
    });
    iceMageBpId = row.id;
  });

  test("createBlueprint — flame sword weapon", async () => {
    const row = await svc.createBlueprint(orgId, {
      schemaId: weaponSchemaId,
      name: "烈焰之剑",
      alias: "flame-sword",
      rarity: "SR",
      tags: { class: "warrior" },
      baseStats: { atk: 50 },
    });
    flameSwordBpId = row.id;
  });

  test("createBlueprint — invalid schemaId", async () => {
    await expect(
      svc.createBlueprint(orgId, {
        schemaId: "00000000-0000-0000-0000-000000000000",
        name: "Bad",
      }),
    ).rejects.toThrow("not found");
  });

  test("createBlueprint — alias conflict", async () => {
    await expect(
      svc.createBlueprint(orgId, {
        schemaId: heroSchemaId,
        name: "Dup",
        alias: "fire-warrior",
      }),
    ).rejects.toThrow("alias already in use");
  });

  test("listBlueprints — all", async () => {
    const rows = await svc.listBlueprints(orgId);
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  test("listBlueprints — filter by schemaId", async () => {
    const heroBlueprints = await svc.listBlueprints(orgId, {
      schemaId: heroSchemaId,
    });
    expect(heroBlueprints.every((r) => r.schemaId === heroSchemaId)).toBe(true);
    expect(heroBlueprints.length).toBe(2);

    const weaponBlueprints = await svc.listBlueprints(orgId, {
      schemaId: weaponSchemaId,
    });
    expect(weaponBlueprints.length).toBe(1);
  });

  test("getBlueprint — by alias", async () => {
    const row = await svc.getBlueprint(orgId, "flame-sword");
    expect(row.id).toBe(flameSwordBpId);
  });

  test("updateBlueprint — change rarity and stats", async () => {
    const row = await svc.updateBlueprint(orgId, fireWarriorBpId, {
      rarity: "UR",
      baseStats: { hp: 1500, atk: 100 },
    });
    expect(row.rarity).toBe("UR");
    expect(row.baseStats).toEqual({ hp: 1500, atk: 100 });
  });

  // ═══════════════════════════════════════════════════════════════
  // Skin CRUD
  // ═══════════════════════════════════════════════════════════════

  let dragonSkinId: string;

  test("createSkin", async () => {
    const row = await svc.createSkin(orgId, fireWarriorBpId, {
      name: "龙鳞铠甲",
      alias: "dragon-scale",
      rarity: "SSR",
      assets: {
        icon: "https://cdn.example.com/dragon-skin.png",
        model3d: "https://cdn.example.com/dragon-skin.glb",
      },
      statBonuses: { hp: 100, atk: 10 },
      isDefault: false,
    });

    expect(row.name).toBe("龙鳞铠甲");
    expect(row.statBonuses).toEqual({ hp: 100, atk: 10 });
    expect(row.assets.model3d).toBe("https://cdn.example.com/dragon-skin.glb");
    dragonSkinId = row.id;
  });

  test("createSkin — alias conflict within blueprint", async () => {
    await expect(
      svc.createSkin(orgId, fireWarriorBpId, {
        name: "Dup",
        alias: "dragon-scale",
      }),
    ).rejects.toThrow("alias already in use");
  });

  test("createSkin — invalid blueprintId", async () => {
    await expect(
      svc.createSkin(orgId, "00000000-0000-0000-0000-000000000000", {
        name: "Bad",
      }),
    ).rejects.toThrow("not found");
  });

  test("listSkins", async () => {
    const rows = await svc.listSkins(orgId, fireWarriorBpId);
    expect(rows.length).toBe(1);
    expect(rows[0]!.name).toBe("龙鳞铠甲");
  });

  test("getSkin", async () => {
    const row = await svc.getSkin(orgId, dragonSkinId);
    expect(row.name).toBe("龙鳞铠甲");
  });

  test("updateSkin", async () => {
    const row = await svc.updateSkin(orgId, dragonSkinId, {
      statBonuses: { hp: 200, atk: 20 },
    });
    expect(row.statBonuses).toEqual({ hp: 200, atk: 20 });
  });

  test("deleteSkin", async () => {
    // Create a throw-away skin to delete
    const tmp = await svc.createSkin(orgId, fireWarriorBpId, {
      name: "Temp",
    });
    await svc.deleteSkin(orgId, tmp.id);
    await expect(svc.getSkin(orgId, tmp.id)).rejects.toThrow("not found");
  });

  // ═══════════════════════════════════════════════════════════════
  // FormationConfig CRUD
  // ═══════════════════════════════════════════════════════════════

  let formConfigId: string;

  test("createFormationConfig", async () => {
    const row = await svc.createFormationConfig(orgId, {
      name: "Default Formation",
      alias: "default",
      maxFormations: 5,
      maxSlots: 4,
      acceptsSchemaIds: [heroSchemaId],
      allowDuplicateBlueprints: false,
    });

    expect(row.name).toBe("Default Formation");
    expect(row.maxFormations).toBe(5);
    expect(row.maxSlots).toBe(4);
    expect(row.acceptsSchemaIds).toEqual([heroSchemaId]);
    formConfigId = row.id;
  });

  test("createFormationConfig — alias conflict", async () => {
    await expect(
      svc.createFormationConfig(orgId, { name: "Dup", alias: "default" }),
    ).rejects.toThrow("alias already in use");
  });

  test("listFormationConfigs", async () => {
    const rows = await svc.listFormationConfigs(orgId);
    expect(rows.length).toBe(1);
  });

  test("getFormationConfig — by alias", async () => {
    const row = await svc.getFormationConfig(orgId, "default");
    expect(row.id).toBe(formConfigId);
  });

  test("updateFormationConfig", async () => {
    const row = await svc.updateFormationConfig(orgId, formConfigId, {
      maxSlots: 6,
    });
    expect(row.maxSlots).toBe(6);
  });

  test("deleteFormationConfig", async () => {
    const tmp = await svc.createFormationConfig(orgId, { name: "Temp" });
    await svc.deleteFormationConfig(orgId, tmp.id);
    await expect(
      svc.getFormationConfig(orgId, tmp.id),
    ).rejects.toThrow("not found");
  });

  // ═══════════════════════════════════════════════════════════════
  // Cascade deletion
  // ═══════════════════════════════════════════════════════════════

  test("deleteSchema cascades to blueprints and skins", async () => {
    // Create a temp schema with a blueprint and skin
    const tmpSchema = await svc.createSchema(orgId, {
      name: "TempSchema",
    });
    const tmpBp = await svc.createBlueprint(orgId, {
      schemaId: tmpSchema.id,
      name: "TempBP",
    });
    await svc.createSkin(orgId, tmpBp.id, { name: "TempSkin" });

    // Delete schema — should cascade to blueprint and skin
    await svc.deleteSchema(orgId, tmpSchema.id);

    await expect(
      svc.getBlueprint(orgId, tmpBp.id),
    ).rejects.toThrow("not found");
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 2-5: Instance, Progression, Slots, Formations
// ═══════════════════════════════════════════════════════════════

describe("entity service — Phase 2-5", () => {
  const itemSvc = createItemService({ db });
  const svc = createEntityService({ db }, itemSvc);
  let orgId: string;

  // Schema + blueprint IDs seeded in beforeAll
  let heroSchemaId: string;
  let weaponSchemaId: string;
  let fireWarriorBpId: string;
  let fireWarriorBp2Id: string; // duplicate for synthesis
  let fireWarriorBp3Id: string; // another duplicate
  let flameSwordBpId: string;
  let skinId: string;
  let goldDefId: string;
  let formConfigId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("entity-svc-p2");

    // Create schemas
    const heroSchema = await svc.createSchema(orgId, {
      name: "Hero",
      alias: "hero-p2",
      statDefinitions: [
        { key: "hp", label: "HP", type: "integer", defaultValue: 0 },
        { key: "atk", label: "ATK", type: "integer", defaultValue: 0 },
      ],
      tagDefinitions: [
        { key: "class", label: "Class", values: ["warrior", "mage", "all"] },
      ],
      slotDefinitions: [
        {
          key: "weapon",
          label: "Weapon",
          acceptsSchemaIds: [],  // will be filled after weapon schema
          acceptsTags: { class: "$owner.class" },
          maxCount: 1,
        },
      ],
      levelConfig: { enabled: true, maxLevel: 10 },
      rankConfig: {
        enabled: true,
        ranks: [
          { key: "N", label: "Normal", order: 0 },
          { key: "R", label: "Rare", order: 1 },
          { key: "SR", label: "Super Rare", order: 2 },
        ],
      },
      synthesisConfig: { enabled: true, sameBlueprint: true, inputCount: 2 },
    });
    heroSchemaId = heroSchema.id;

    const weaponSchema = await svc.createSchema(orgId, {
      name: "Weapon",
      alias: "weapon-p2",
      statDefinitions: [
        { key: "atk", label: "ATK", type: "integer", defaultValue: 0 },
      ],
      tagDefinitions: [
        { key: "class", label: "Class", values: ["warrior", "mage", "all"] },
      ],
      levelConfig: { enabled: false, maxLevel: 1 },
    });
    weaponSchemaId = weaponSchema.id;

    // Update hero schema slots to reference weapon schema
    await svc.updateSchema(orgId, heroSchemaId, {
      slotDefinitions: [
        {
          key: "weapon",
          label: "Weapon",
          acceptsSchemaIds: [weaponSchemaId],
          acceptsTags: { class: "$owner.class" },
          maxCount: 1,
        },
      ],
    });

    // Create item definition for gold (material)
    const goldDef = await itemSvc.createDefinition(orgId, {
      name: "Gold",
      alias: "gold-p2",
      stackable: true,
    });
    goldDefId = goldDef.id;

    // Create blueprints
    const fw = await svc.createBlueprint(orgId, {
      schemaId: heroSchemaId,
      name: "Fire Warrior",
      alias: "fw-p2",
      rarity: "SSR",
      tags: { class: "warrior" },
      baseStats: { hp: 100, atk: 50 },
      statGrowth: { hp: 10, atk: 5 },
      levelUpCosts: [
        { level: 2, cost: [{ type: "item" as const, id: goldDefId, count: 10 }] },
        { level: 3, cost: [{ type: "item" as const, id: goldDefId, count: 20 }] },
      ],
      rankUpCosts: [
        {
          fromRank: "N",
          toRank: "R",
          cost: [{ type: "item" as const, id: goldDefId, count: 50 }],
          statBonuses: { hp: 20, atk: 10 },
        },
      ],
      synthesisCost: {
        inputCount: 2,
        cost: [{ type: "item" as const, id: goldDefId, count: 100 }],
        resultBonuses: { hp: 50, atk: 25 },
      },
    });
    fireWarriorBpId = fw.id;

    const fs = await svc.createBlueprint(orgId, {
      schemaId: weaponSchemaId,
      name: "Flame Sword",
      alias: "fs-p2",
      tags: { class: "warrior" },
      baseStats: { atk: 30 },
    });
    flameSwordBpId = fs.id;

    // Create skin
    const sk = await svc.createSkin(orgId, fireWarriorBpId, {
      name: "Dragon Armor",
      alias: "dragon-p2",
      statBonuses: { hp: 5, atk: 3 },
    });
    skinId = sk.id;

    // Create formation config
    const fc = await svc.createFormationConfig(orgId, {
      name: "Battle",
      alias: "battle-p2",
      maxFormations: 3,
      maxSlots: 2,
      acceptsSchemaIds: [heroSchemaId],
      allowDuplicateBlueprints: false,
    });
    formConfigId = fc.id;
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── Instance Management ──────────────────────────────────────

  let heroInstId: string;
  let heroInstId2: string;
  let heroInstId3: string;
  let weaponInstId: string;

  test("acquireEntity — hero", async () => {
    const inst = await svc.acquireEntity(
      orgId, "player-1", fireWarriorBpId, "test",
    );
    expect(inst.level).toBe(1);
    expect(inst.rankKey).toBe("N");
    expect(inst.computedStats.hp).toBe(100);
    expect(inst.computedStats.atk).toBe(50);
    heroInstId = inst.id;
  });

  test("acquireEntity — duplicate heroes for synthesis", async () => {
    const inst2 = await svc.acquireEntity(
      orgId, "player-1", fireWarriorBpId, "test",
    );
    heroInstId2 = inst2.id;

    const inst3 = await svc.acquireEntity(
      orgId, "player-1", fireWarriorBpId, "test",
    );
    heroInstId3 = inst3.id;
  });

  test("acquireEntity — weapon", async () => {
    const inst = await svc.acquireEntity(
      orgId, "player-1", flameSwordBpId, "test",
    );
    expect(inst.computedStats.atk).toBe(30);
    weaponInstId = inst.id;
  });

  test("listInstances — all", async () => {
    const rows = await svc.listInstances(orgId, "player-1");
    expect(rows.length).toBe(4);
  });

  test("listInstances — filter by schemaId", async () => {
    const heroes = await svc.listInstances(orgId, "player-1", {
      schemaId: heroSchemaId,
    });
    expect(heroes.length).toBe(3);
  });

  test("getInstance — returns instance + slots", async () => {
    const result = await svc.getInstance(orgId, "player-1", heroInstId);
    expect(result.instance.id).toBe(heroInstId);
    expect(result.slots).toEqual([]);
  });

  test("toggleLock", async () => {
    const locked = await svc.toggleLock(orgId, "player-1", heroInstId, true);
    expect(locked.isLocked).toBe(true);
    const unlocked = await svc.toggleLock(orgId, "player-1", heroInstId, false);
    expect(unlocked.isLocked).toBe(false);
  });

  // ─── Progression ──────────────────────────────────────────────

  test("addExp", async () => {
    const inst = await svc.addExp(orgId, "player-1", heroInstId, 500);
    expect(inst.exp).toBe(500);
  });

  test("levelUp — from 1 to 2 (consumes gold)", async () => {
    // Grant gold first
    await itemSvc.grantItems({
      organizationId: orgId,
      endUserId: "player-1",
      grants: [{ definitionId: goldDefId, quantity: 1000 }],
      source: "test",
    });

    const inst = await svc.levelUp(orgId, "player-1", heroInstId);
    expect(inst.level).toBe(2);
    // Stats: base(100) + growth(10)×1 = 110
    expect(inst.computedStats.hp).toBe(110);
    expect(inst.computedStats.atk).toBe(55);
  });

  test("levelUp — multi-level from 2 to 3", async () => {
    const inst = await svc.levelUp(orgId, "player-1", heroInstId, 3);
    expect(inst.level).toBe(3);
    // Stats: base(100) + growth(10)×2 = 120
    expect(inst.computedStats.hp).toBe(120);
  });

  test("levelUp — max level error", async () => {
    // Level up to 10 (max)
    for (let lv = 4; lv <= 10; lv++) {
      await svc.levelUp(orgId, "player-1", heroInstId, lv);
    }
    await expect(
      svc.levelUp(orgId, "player-1", heroInstId),
    ).rejects.toThrow("max level");
  });

  test("rankUp — N to R (consumes gold)", async () => {
    const inst = await svc.rankUp(orgId, "player-1", heroInstId);
    expect(inst.rankKey).toBe("R");
    // Stats include rank bonus: base(100) + growth(10)×9 + rankBonus(20) = 210
    expect(inst.computedStats.hp).toBe(210);
    expect(inst.computedStats.atk).toBe(105); // 50 + 5×9 + 10
  });

  // ─── Slot System ──────────────────────────────────────────────

  test("equip — weapon into hero slot", async () => {
    const slot = await svc.equip(
      orgId, "player-1", heroInstId, "weapon", 0, weaponInstId,
    );
    expect(slot.slotKey).toBe("weapon");
    expect(slot.equippedInstanceId).toBe(weaponInstId);

    // Hero stats should now include weapon ATK
    const result = await svc.getInstance(orgId, "player-1", heroInstId);
    // atk = 50 + 5×9 + 10(rank) + 30(weapon) = 135
    expect(result.instance.computedStats.atk).toBe(135);
  });

  test("equip — already equipped error", async () => {
    const weapon2 = await svc.acquireEntity(
      orgId, "player-1", flameSwordBpId, "test",
    );
    // Try to equip weapon that's already in a slot elsewhere
    await expect(
      svc.equip(orgId, "player-1", heroInstId, "weapon", 0, weapon2.id),
    ).rejects.toThrow("occupied");

    // Clean up
    await svc.discardEntity(orgId, "player-1", weapon2.id);
  });

  test("unequip — weapon from hero slot", async () => {
    await svc.unequip(orgId, "player-1", heroInstId, "weapon", 0);

    const result = await svc.getInstance(orgId, "player-1", heroInstId);
    expect(result.slots).toEqual([]);
    // atk back to: 50 + 5×9 + 10(rank) = 105
    expect(result.instance.computedStats.atk).toBe(105);
  });

  // ─── Skin ─────────────────────────────────────────────────────

  test("changeSkin — apply skin with stat bonuses", async () => {
    const inst = await svc.changeSkin(orgId, "player-1", heroInstId, skinId);
    expect(inst.skinId).toBe(skinId);
    // hp = 210 + 5(skin) = 215, atk = 105 + 3(skin) = 108
    expect(inst.computedStats.hp).toBe(215);
    expect(inst.computedStats.atk).toBe(108);
  });

  test("changeSkin — remove skin", async () => {
    const inst = await svc.changeSkin(orgId, "player-1", heroInstId, null);
    expect(inst.skinId).toBeNull();
    expect(inst.computedStats.hp).toBe(210);
  });

  // ─── Synthesis ────────────────────────────────────────────────

  test("synthesize — merge 2 duplicates (consumes gold)", async () => {
    // Need a 4th duplicate as extra feed (synthesisCost.inputCount=2)
    const extra = await svc.acquireEntity(
      orgId, "player-1", fireWarriorBpId, "test",
    );

    const inst = await svc.synthesize(
      orgId,
      "player-1",
      heroInstId2,
      [heroInstId3, extra.id],
    );
    expect(inst.id).toBe(heroInstId2);
    // Feeds should be deleted
    await expect(
      svc.getInstance(orgId, "player-1", heroInstId3),
    ).rejects.toThrow("not found");
    await expect(
      svc.getInstance(orgId, "player-1", extra.id),
    ).rejects.toThrow("not found");
  });

  // ─── Discard ──────────────────────────────────────────────────

  test("discardEntity — locked entity fails", async () => {
    await svc.toggleLock(orgId, "player-1", heroInstId2, true);
    await expect(
      svc.discardEntity(orgId, "player-1", heroInstId2),
    ).rejects.toThrow("locked");
    await svc.toggleLock(orgId, "player-1", heroInstId2, false);
  });

  test("discardEntity — success", async () => {
    await svc.discardEntity(orgId, "player-1", heroInstId2);
    await expect(
      svc.getInstance(orgId, "player-1", heroInstId2),
    ).rejects.toThrow("not found");
  });

  // ─── Formations ───────────────────────────────────────────────

  test("updateFormation — create a new formation", async () => {
    const form = await svc.updateFormation(
      orgId,
      "player-1",
      formConfigId,
      0,
      "Main Team",
      [
        { slotIndex: 0, instanceId: heroInstId },
        { slotIndex: 1, instanceId: null },
      ],
    );
    expect(form.name).toBe("Main Team");
    expect(form.formationIndex).toBe(0);
    expect(form.slots).toHaveLength(2);
  });

  test("listFormations", async () => {
    const rows = await svc.listFormations(orgId, "player-1", formConfigId);
    expect(rows.length).toBe(1);
    expect(rows[0]!.name).toBe("Main Team");
  });

  test("updateFormation — exceeds maxFormations", async () => {
    await expect(
      svc.updateFormation(orgId, "player-1", formConfigId, 5, "Bad", []),
    ).rejects.toThrow("exceeds max");
  });
});
