/**
 * Audit-log service tests.
 *
 * 直接 INSERT 行到 `audit_logs` 模拟 middleware 的写入产物，再用 service 的
 * `list` / `get` / `listResourceTypes` 验证查询逻辑。Middleware 自身的写入
 * 路径依赖 `c.executionCtx.waitUntil`，在 vitest 下无法触达 —— 那部分由
 * production / wrangler dev 的集成场景覆盖。
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { auditLogs, type AuditLogInsert } from "../../schema/audit-log";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createAuditLogService } from "./service";

/** Build a minimal valid row with sensible defaults; overrides win. */
function row(orgId: string, overrides: Partial<AuditLogInsert> = {}): AuditLogInsert {
  return {
    tenantId: orgId,
    actorType: "user",
    actorId: "u_test",
    actorLabel: "tester@example.com",
    resourceType: "module:check-in",
    resourceId: null,
    resourceLabel: null,
    action: "update",
    method: "PATCH",
    path: "/api/v1/check-in/configs/abc",
    status: 200,
    traceId: null,
    ip: null,
    userAgent: null,
    before: null,
    after: null,
    metadata: null,
    ...overrides,
  };
}

describe("audit-log service — list / get / cursor", () => {
  const svc = createAuditLogService({ db });
  let orgId: string;
  let otherOrgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("audit-list");
    otherOrgId = await createTestOrg("audit-list-other");

    // Seed 5 rows in `orgId` with strictly increasing `ts` so order is
    // deterministic. The list returns DESC by (ts, id) so 't5' is first.
    const base = Date.now();
    await db.insert(auditLogs).values([
      row(orgId, {
        ts: new Date(base + 1000),
        action: "create",
        method: "POST",
        path: "/api/v1/cdkey/batches",
        resourceType: "cdkey.batch",
        resourceId: "b1",
        resourceLabel: "summer-promo",
      }),
      row(orgId, {
        ts: new Date(base + 2000),
        action: "update",
        method: "PATCH",
        path: "/api/v1/cdkey/batches/b1",
        resourceType: "cdkey.batch",
        resourceId: "b1",
      }),
      row(orgId, {
        ts: new Date(base + 3000),
        actorType: "admin-api-key",
        actorId: null,
        actorLabel: "admin-api-key",
        action: "delete",
        method: "DELETE",
        path: "/api/v1/shop/items/it1",
        resourceType: "module:shop",
        resourceId: "it1",
      }),
      row(orgId, {
        ts: new Date(base + 4000),
        action: "create",
        method: "POST",
        path: "/api/v1/check-in/configs",
        resourceType: "module:check-in",
      }),
      row(orgId, {
        ts: new Date(base + 5000),
        action: "update",
        method: "PUT",
        path: "/api/v1/check-in/configs/abc",
      }),
    ]);

    // One row in the other org — must NOT leak into queries.
    await db.insert(auditLogs).values(
      row(otherOrgId, { resourceType: "leaked.from.other.org" }),
    );
  });

  afterAll(async () => {
    // Cascade from organization deletes audit_logs rows for both orgs.
    await deleteTestOrg(orgId);
    await deleteTestOrg(otherOrgId);
  });

  test("list returns rows in (ts DESC, id DESC) within org", async () => {
    const page = await svc.list(orgId, {});
    expect(page.items).toHaveLength(5);
    // Newest first
    expect(page.items[0]?.path).toBe("/api/v1/check-in/configs/abc");
    expect(page.items[4]?.path).toBe("/api/v1/cdkey/batches");
  });

  test("list isolates by organization (no leakage)", async () => {
    const page = await svc.list(orgId, {});
    const types = page.items.map((i) => i.resourceType);
    expect(types).not.toContain("leaked.from.other.org");
  });

  test("filter by actorType=admin-api-key narrows correctly", async () => {
    const page = await svc.list(orgId, { actorType: "admin-api-key" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.path).toBe("/api/v1/shop/items/it1");
  });

  test("filter by resourceType=cdkey.batch returns only batch rows", async () => {
    const page = await svc.list(orgId, { resourceType: "cdkey.batch" });
    expect(page.items).toHaveLength(2);
    for (const item of page.items) {
      expect(item.resourceType).toBe("cdkey.batch");
    }
  });

  test("filter by action=delete works", async () => {
    const page = await svc.list(orgId, { action: "delete" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.method).toBe("DELETE");
  });

  test("filter by method (multiEnum) — POST,PATCH catches creates+updates", async () => {
    // Service-level contract: `method` arrives already split into an array
    // (the route's zod schema does the comma-string → array transform).
    const page = await svc.list(orgId, { method: ["POST", "PATCH"] });
    const methods = page.items.map((i) => i.method);
    expect(methods.sort()).toEqual(["PATCH", "POST", "POST"]);
  });

  test("search (q) does ILIKE across path / actorLabel / resourceLabel", async () => {
    const page = await svc.list(orgId, { q: "summer-promo" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.resourceLabel).toBe("summer-promo");
  });

  test("limit + cursor paginate forward in order", async () => {
    const first = await svc.list(orgId, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();

    const second = await svc.list(orgId, { limit: 2, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(2);
    // No overlap with first page
    const firstIds = new Set(first.items.map((i) => i.id));
    for (const item of second.items) expect(firstIds.has(item.id)).toBe(false);

    const third = await svc.list(orgId, { limit: 2, cursor: second.nextCursor! });
    expect(third.items).toHaveLength(1);
    expect(third.nextCursor).toBeNull();
  });

  test("get returns the row and respects org isolation", async () => {
    const page = await svc.list(orgId, { limit: 1 });
    const first = page.items[0]!;
    const fetched = await svc.get(orgId, first.id);
    expect(fetched.id).toBe(first.id);

    // Same id read from the OTHER org → not_found
    await expect(svc.get(otherOrgId, first.id)).rejects.toThrow(
      /not_found|not found/i,
    );
  });

  test("listResourceTypes returns distinct sorted types for the org", async () => {
    const types = await svc.listResourceTypes(orgId);
    // Three distinct: cdkey.batch, module:check-in, module:shop
    expect(types).toEqual([
      "cdkey.batch",
      "module:check-in",
      "module:shop",
    ]);
  });
});

describe("audit-log service — get / not found", () => {
  const svc = createAuditLogService({ db });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("audit-not-found");
  });
  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("get throws AuditLogNotFound for unknown id", async () => {
    await expect(
      svc.get(orgId, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ code: "audit_log.not_found" });
  });
});

describe("audit-log service — empty org", () => {
  const svc = createAuditLogService({ db });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("audit-empty");
  });
  afterAll(async () => {
    // Manually clean any rows seeded above (none expected, but be safe)
    await db.delete(auditLogs).where(eq(auditLogs.tenantId, orgId));
    await deleteTestOrg(orgId);
  });

  test("list on empty org returns empty page with no cursor", async () => {
    const page = await svc.list(orgId, {});
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  test("listResourceTypes returns [] for empty org", async () => {
    const types = await svc.listResourceTypes(orgId);
    expect(types).toEqual([]);
  });
});
