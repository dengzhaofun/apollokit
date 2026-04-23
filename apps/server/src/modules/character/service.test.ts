/**
 * Service-layer tests for character — CRUD, alias uniqueness, org
 * isolation, and the two helper methods consumed by dialogue
 * (`assertCharactersExist`, `loadCharactersByIds`). Hits the real Neon
 * dev branch, no mocks (see apps/server/CLAUDE.md → Testing).
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createCharacterService } from "./service";

const svc = createCharacterService({ db });

describe("character service — CRUD", () => {
  let orgId: string;
  beforeAll(async () => {
    orgId = await createTestOrg("character-crud");
  });
  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("create + get + list", async () => {
    const created = await svc.createCharacter(orgId, {
      alias: "npc-village-chief",
      name: "Village Chief",
      description: "Elderly man who runs the village.",
      avatarUrl: "https://cdn.example.com/chief-avatar.png",
      portraitUrl: "https://cdn.example.com/chief-portrait.png",
      defaultSide: "left",
    });
    expect(created.id).toBeTruthy();
    expect(created.alias).toBe("npc-village-chief");
    expect(created.isActive).toBe(true);

    const got = await svc.getCharacter(orgId, created.id);
    expect(got.name).toBe("Village Chief");

    const list = await svc.listCharacters(orgId);
    expect(list.some((c) => c.id === created.id)).toBe(true);
  });

  test("alias null is allowed; partial unique index lets multiple nullish coexist", async () => {
    const a = await svc.createCharacter(orgId, { name: "Unnamed A" });
    const b = await svc.createCharacter(orgId, { name: "Unnamed B" });
    expect(a.alias).toBeNull();
    expect(b.alias).toBeNull();
    expect(a.id).not.toBe(b.id);
  });

  test("duplicate alias in same org → character.alias_conflict", async () => {
    const alias = `dup-${crypto.randomUUID().slice(0, 6)}`;
    await svc.createCharacter(orgId, { alias, name: "First" });
    await expect(
      svc.createCharacter(orgId, { alias, name: "Second" }),
    ).rejects.toMatchObject({ code: "character.alias_conflict" });
  });

  test("update patches only provided fields", async () => {
    const created = await svc.createCharacter(orgId, {
      name: "Mage",
      avatarUrl: "https://cdn.example.com/a1.png",
    });
    const updated = await svc.updateCharacter(orgId, created.id, {
      name: "Arch Mage",
    });
    expect(updated.name).toBe("Arch Mage");
    expect(updated.avatarUrl).toBe("https://cdn.example.com/a1.png");
  });

  test("update unknown id → character.not_found", async () => {
    await expect(
      svc.updateCharacter(orgId, crypto.randomUUID(), { name: "x" }),
    ).rejects.toMatchObject({ code: "character.not_found" });
  });

  test("delete removes the row; second delete → not_found", async () => {
    const created = await svc.createCharacter(orgId, { name: "Ephemeral" });
    await svc.deleteCharacter(orgId, created.id);
    await expect(
      svc.deleteCharacter(orgId, created.id),
    ).rejects.toMatchObject({ code: "character.not_found" });
  });
});

describe("character service — org isolation", () => {
  let orgA: string;
  let orgB: string;
  beforeAll(async () => {
    orgA = await createTestOrg("character-iso-a");
    orgB = await createTestOrg("character-iso-b");
  });
  afterAll(async () => {
    await deleteTestOrg(orgA);
    await deleteTestOrg(orgB);
  });

  test("same alias across different orgs is fine", async () => {
    const alias = "shared-alias";
    const a = await svc.createCharacter(orgA, { alias, name: "A" });
    const b = await svc.createCharacter(orgB, { alias, name: "B" });
    expect(a.id).not.toBe(b.id);
  });

  test("cannot read another org's character", async () => {
    const c = await svc.createCharacter(orgA, { name: "Private" });
    await expect(svc.getCharacter(orgB, c.id)).rejects.toMatchObject({
      code: "character.not_found",
    });
  });

  test("list is scoped to the org", async () => {
    // Seed a few in orgA; orgB should see none of them.
    await svc.createCharacter(orgA, { name: "only-a-1" });
    await svc.createCharacter(orgA, { name: "only-a-2" });
    const bList = await svc.listCharacters(orgB);
    const bNames = bList.map((c) => c.name);
    expect(bNames).not.toContain("only-a-1");
    expect(bNames).not.toContain("only-a-2");
  });
});

describe("character service — helpers for dialogue", () => {
  let orgId: string;
  beforeAll(async () => {
    orgId = await createTestOrg("character-helpers");
  });
  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("loadCharactersByIds returns a Map keyed by id", async () => {
    const a = await svc.createCharacter(orgId, {
      name: "Hero",
      avatarUrl: "https://cdn.example.com/hero.png",
    });
    const b = await svc.createCharacter(orgId, {
      name: "Villain",
      portraitUrl: "https://cdn.example.com/villain-portrait.png",
    });
    const map = await svc.loadCharactersByIds(orgId, [a.id, b.id]);
    expect(map.size).toBe(2);
    expect(map.get(a.id)?.name).toBe("Hero");
    expect(map.get(b.id)?.portraitUrl).toBe(
      "https://cdn.example.com/villain-portrait.png",
    );
  });

  test("loadCharactersByIds silently drops missing ids", async () => {
    const real = await svc.createCharacter(orgId, { name: "Real" });
    const map = await svc.loadCharactersByIds(orgId, [
      real.id,
      crypto.randomUUID(),
    ]);
    expect(map.size).toBe(1);
    expect(map.get(real.id)?.name).toBe("Real");
  });

  test("assertCharactersExist throws on first missing id", async () => {
    const real = await svc.createCharacter(orgId, { name: "Real-2" });
    await expect(
      svc.assertCharactersExist(orgId, [real.id, crypto.randomUUID()]),
    ).rejects.toMatchObject({ code: "character.not_found" });
  });

  test("assertCharactersExist returns cleanly when all exist", async () => {
    const a = await svc.createCharacter(orgId, { name: "A" });
    const b = await svc.createCharacter(orgId, { name: "B" });
    await expect(
      svc.assertCharactersExist(orgId, [a.id, b.id]),
    ).resolves.toBeUndefined();
  });

  test("empty id array is a no-op (no DB call required)", async () => {
    await expect(
      svc.assertCharactersExist(orgId, []),
    ).resolves.toBeUndefined();
    const map = await svc.loadCharactersByIds(orgId, []);
    expect(map.size).toBe(0);
  });
});
