/**
 * Service-layer tests for navigation favorites.
 *
 * Seeds a test org + a test user (the user table is FK-referenced from
 * navigation_favorites.user_id), exercises the service factory directly
 * against the real Neon dev branch, and cleans up via cascade.
 */
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { db } from "../../db"
import { user } from "../../schema/auth"
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures"
import { NavigationFavoriteLimitReached, NavigationFavoriteNotFound } from "./errors"
import { createNavigationService, FAVORITE_LIMIT } from "./service"

describe("navigation favorites service", () => {
  const svc = createNavigationService({ db })
  let orgId: string
  let otherOrgId: string
  let userId: string
  let otherUserId: string

  beforeAll(async () => {
    orgId = await createTestOrg("nav-fav-svc")
    otherOrgId = await createTestOrg("nav-fav-svc-other")
    userId = `test-user-${crypto.randomUUID()}`
    otherUserId = `test-user-${crypto.randomUUID()}`
    await db.insert(user).values([
      {
        id: userId,
        name: "nav-fav-svc",
        email: `${userId}@test.local`,
      },
      {
        id: otherUserId,
        name: "nav-fav-svc-other",
        email: `${otherUserId}@test.local`,
      },
    ])
  })

  afterAll(async () => {
    // Org delete cascades the favorites; clean up users separately.
    await deleteTestOrg(orgId)
    await deleteTestOrg(otherOrgId)
    await db.delete(user).where(eq(user.id, userId))
    await db.delete(user).where(eq(user.id, otherUserId))
  })

  test("add then list returns the favorite", async () => {
    await svc.add(orgId, userId, "/shop")
    const items = await svc.list(orgId, userId)
    expect(items).toHaveLength(1)
    expect(items[0]!.routePath).toBe("/shop")
    expect(typeof items[0]!.sortOrder).toBe("string")
    expect(items[0]!.sortOrder.length).toBeGreaterThan(0)
  })

  test("add multiple — list is sorted by sortOrder desc (most recent first)", async () => {
    const localOrg = await createTestOrg("nav-fav-svc-order")
    try {
      await svc.add(localOrg, userId, "/a")
      await svc.add(localOrg, userId, "/b")
      await svc.add(localOrg, userId, "/c")
      const items = await svc.list(localOrg, userId)
      expect(items.map((i) => i.routePath)).toEqual(["/c", "/b", "/a"])
      // fractional keys: /c was appended last so it has the largest key, DESC sort puts it first
      const keys = items.map((i) => i.sortOrder)
      expect(keys[0]! > keys[1]!).toBe(true)
      expect(keys[1]! > keys[2]!).toBe(true)
    } finally {
      await deleteTestOrg(localOrg)
    }
  })

  test("re-adding the same routePath is idempotent — keeps original sortOrder", async () => {
    const localOrg = await createTestOrg("nav-fav-svc-idem")
    try {
      const first = await svc.add(localOrg, userId, "/dup")
      await svc.add(localOrg, userId, "/other")
      const second = await svc.add(localOrg, userId, "/dup")
      expect(second.id).toBe(first.id)
      expect(second.sortOrder).toBe(first.sortOrder)
      const items = await svc.list(localOrg, userId)
      // /other was inserted second so it should be on top
      expect(items.map((i) => i.routePath)).toEqual(["/other", "/dup"])
    } finally {
      await deleteTestOrg(localOrg)
    }
  })

  test("remove deletes the favorite", async () => {
    const localOrg = await createTestOrg("nav-fav-svc-del")
    try {
      await svc.add(localOrg, userId, "/x")
      await svc.add(localOrg, userId, "/y")
      await svc.remove(localOrg, userId, "/x")
      const items = await svc.list(localOrg, userId)
      expect(items.map((i) => i.routePath)).toEqual(["/y"])
    } finally {
      await deleteTestOrg(localOrg)
    }
  })

  test("remove unknown routePath throws NotFound", async () => {
    await expect(svc.remove(orgId, userId, "/never-pinned")).rejects.toBeInstanceOf(
      NavigationFavoriteNotFound,
    )
  })

  test("favorite limit enforced", async () => {
    const localOrg = await createTestOrg("nav-fav-svc-limit")
    try {
      for (let i = 0; i < FAVORITE_LIMIT; i++) {
        await svc.add(localOrg, userId, `/r${i}`)
      }
      await expect(svc.add(localOrg, userId, "/overflow")).rejects.toBeInstanceOf(
        NavigationFavoriteLimitReached,
      )
    } finally {
      await deleteTestOrg(localOrg)
    }
  })

  test("favorites are scoped per org", async () => {
    await svc.add(orgId, userId, "/scope-a")
    await svc.add(otherOrgId, userId, "/scope-b")
    const a = await svc.list(orgId, userId)
    const b = await svc.list(otherOrgId, userId)
    expect(a.map((i) => i.routePath)).toContain("/scope-a")
    expect(a.map((i) => i.routePath)).not.toContain("/scope-b")
    expect(b.map((i) => i.routePath)).toContain("/scope-b")
    expect(b.map((i) => i.routePath)).not.toContain("/scope-a")
  })

  test("favorites are scoped per user", async () => {
    const localOrg = await createTestOrg("nav-fav-svc-user-scope")
    try {
      await svc.add(localOrg, userId, "/mine")
      await svc.add(localOrg, otherUserId, "/theirs")
      const mine = await svc.list(localOrg, userId)
      const theirs = await svc.list(localOrg, otherUserId)
      expect(mine.map((i) => i.routePath)).toEqual(["/mine"])
      expect(theirs.map((i) => i.routePath)).toEqual(["/theirs"])
    } finally {
      await deleteTestOrg(localOrg)
    }
  })
})
