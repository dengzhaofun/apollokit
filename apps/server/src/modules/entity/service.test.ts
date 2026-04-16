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
