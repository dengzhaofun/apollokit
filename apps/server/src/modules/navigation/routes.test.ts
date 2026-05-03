/**
 * Route-layer tests for /api/v1/navigation.
 *
 * Thin tests:
 *  - 401 without cookie
 *  - GET happy path returns the user's favorites
 *  - POST adds, DELETE removes
 *  - 400 for invalid routePath shape (Zod validation)
 *  - 404 for delete of an unknown routePath (ModuleError mapping)
 *
 * Service-level coverage (limit, scope isolation, upsert idempotency)
 * lives in service.test.ts.
 */
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { db } from "../../db"
import app from "../../index"
import { organization, user } from "../../schema"
import { expectOk } from "../../testing/envelope"

const ORIGIN = "http://localhost:8787"

type SignedInFixture = {
  cookie: string
  orgId: string
  adminUserId: string
  email: string
}

async function signUpAndOrg(): Promise<SignedInFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `nav-routes-${stamp}@example.test`

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      email,
      password: "apollokit-test-pw-z3xK9fQp",
      name: "Nav Routes Test",
    }),
  })
  if (signUp.status !== 200) {
    throw new Error(`sign-up failed ${signUp.status}: ${await signUp.text()}`)
  }
  const setCookie = signUp.headers.get("set-cookie")
  if (!setCookie) throw new Error("sign-up did not return a cookie")
  const cookie = setCookie.split(";")[0]!

  const createOrg = await app.request("/api/auth/organization/create", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({
      name: `Nav Routes Org ${stamp}`,
      slug: `nav-routes-${stamp}`,
    }),
  })
  if (createOrg.status !== 200) {
    throw new Error(
      `org create failed ${createOrg.status}: ${await createOrg.text()}`,
    )
  }
  const orgBody = (await createOrg.json()) as { id: string }
  const orgId = orgBody.id

  const setActive = await app.request("/api/auth/organization/set-active", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({ organizationId: orgId }),
  })
  if (setActive.status !== 200) {
    throw new Error(
      `set-active failed ${setActive.status}: ${await setActive.text()}`,
    )
  }

  const userRows = await db.select().from(user).where(eq(user.email, email))
  const adminUserId = userRows[0]!.id

  return { cookie, orgId, adminUserId, email }
}

describe("navigation routes", () => {
  let fx: SignedInFixture

  beforeAll(async () => {
    fx = await signUpAndOrg()
  })

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, fx.orgId))
    await db.delete(user).where(eq(user.id, fx.adminUserId))
  })

  test("GET /api/v1/navigation/favorites without cookie → 401", async () => {
    const res = await app.request("/api/v1/navigation/favorites")
    expect(res.status).toBe(401)
  })

  test("happy path: POST then GET then DELETE", async () => {
    const create = await app.request("/api/v1/navigation/favorites", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({ routePath: "/shop/categories" }),
    })
    expect(create.status).toBe(201)
    await expectOk<{ id: string; routePath: string }>(create)

    const list = await app.request("/api/v1/navigation/favorites", {
      headers: { cookie: fx.cookie },
    })
    expect(list.status).toBe(200)
    const data = await expectOk<{
      items: Array<{ routePath: string }>
    }>(list)
    expect(data.items.map((i) => i.routePath)).toContain("/shop/categories")

    const del = await app.request(
      `/api/v1/navigation/favorites?routePath=${encodeURIComponent("/shop/categories")}`,
      {
        method: "DELETE",
        headers: { cookie: fx.cookie },
      },
    )
    expect(del.status).toBe(200)

    const after = await app.request("/api/v1/navigation/favorites", {
      headers: { cookie: fx.cookie },
    })
    const afterData = await expectOk<{
      items: Array<{ routePath: string }>
    }>(after)
    expect(afterData.items.map((i) => i.routePath)).not.toContain(
      "/shop/categories",
    )
  })

  test("POST with invalid routePath → 400", async () => {
    const res = await app.request("/api/v1/navigation/favorites", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({ routePath: "no-leading-slash" }),
    })
    expect(res.status).toBe(400)
  })

  test("DELETE unknown routePath → 404", async () => {
    const res = await app.request(
      `/api/v1/navigation/favorites?routePath=${encodeURIComponent("/never-pinned")}`,
      {
        method: "DELETE",
        headers: { cookie: fx.cookie },
      },
    )
    expect(res.status).toBe(404)
  })
})
