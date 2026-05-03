/**
 * Tests for the CMS client routes (`/api/v1/client/cms/*`).
 *
 * Verifies:
 *   - `requireClientCredential` (cpk_) is enforced — no key → 401
 *   - Only published entries surface; drafts and archived are 404 / hidden
 *   - by-alias / group / tag / list endpoints return the sanitized public shape
 *
 * Auth: directly create a client credential via the credential service
 * factory (avoids exercising that module's HTTP CRUD here). Set the
 * `cpk_` in the `x-api-key` header.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import app from "../../index";
import { organization } from "../../schema";
import { createTestOrg } from "../../testing/fixtures";
import { createClientCredentialService } from "../client-credentials/service";
import { createCmsService } from "./service";

const APP_SECRET = process.env.BETTER_AUTH_SECRET ?? "test-secret";

describe("cms client routes", () => {
  const cms = createCmsService({ db });
  let orgId: string;
  let cpk: string;

  const baseSchema = {
    fields: [
      { name: "title", label: "Title", type: "text" as const, required: true },
      { name: "body", label: "Body", type: "markdown" as const },
    ],
  };

  beforeAll(async () => {
    orgId = await createTestOrg("cms-client-routes");

    // Type: faq
    await cms.createType(orgId, {
      alias: "faq",
      name: "FAQ",
      schema: baseSchema,
    });

    // Published entry
    await cms.createEntry(orgId, "faq", {
      alias: "shipping",
      groupKey: "support",
      tags: ["help"],
      data: { title: "Shipping", body: "We ship worldwide." },
      status: "published",
    });
    // Draft entry
    await cms.createEntry(orgId, "faq", {
      alias: "returns",
      groupKey: "support",
      tags: ["help"],
      data: { title: "Returns", body: "TBD." },
    });
    // Published entry, different group/tag
    await cms.createEntry(orgId, "faq", {
      alias: "billing",
      groupKey: "billing",
      tags: ["payment"],
      data: { title: "Billing", body: "Pay via Stripe." },
      status: "published",
    });

    // Issue a client credential against this org
    const credSvc = createClientCredentialService({
      db,
      appSecret: APP_SECRET,
    });
    const cred = await credSvc.create(orgId, {
      name: `cms-client-test-${Date.now()}`,
    });
    cpk = cred.publishableKey;
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, orgId));
  });

  test("missing x-api-key → 401", async () => {
    const res = await app.request("/api/v1/client/cms/by-alias/faq/shipping");
    expect(res.status).toBe(401);
  });

  test("by-alias returns published entry with sanitized shape", async () => {
    const res = await app.request("/api/v1/client/cms/by-alias/faq/shipping", {
      headers: { "x-api-key": cpk },
    });
    expect(res.status).toBe(200);
    const env = (await res.json()) as {
      code: string;
      data: {
        typeAlias: string;
        alias: string;
        groupKey: string | null;
        tags: string[];
        data: Record<string, unknown>;
        schemaVersion: number;
        publishedAt: string;
        // ensure internal fields NOT present
        id?: string;
        version?: number;
        status?: string;
      };
    };
    expect(env.code).toBe("ok");
    expect(env.data.alias).toBe("shipping");
    expect(env.data.typeAlias).toBe("faq");
    expect(env.data.groupKey).toBe("support");
    expect(env.data.tags).toEqual(["help"]);
    expect(env.data.data).toEqual({
      title: "Shipping",
      body: "We ship worldwide.",
    });
    expect(env.data.id).toBeUndefined();
    expect(env.data.version).toBeUndefined();
    expect(env.data.status).toBeUndefined();
    // Cache-Control header set
    expect(res.headers.get("cache-control")).toContain("max-age=60");
  });

  test("by-alias for draft entry → 404 (cms.entry_not_found)", async () => {
    const res = await app.request("/api/v1/client/cms/by-alias/faq/returns", {
      headers: { "x-api-key": cpk },
    });
    expect(res.status).toBe(404);
    const env = (await res.json()) as { code: string };
    expect(env.code).toBe("cms.entry_not_found");
  });

  test("group endpoint returns only published entries in that group", async () => {
    const res = await app.request("/api/v1/client/cms/group/faq/support", {
      headers: { "x-api-key": cpk },
    });
    expect(res.status).toBe(200);
    const env = (await res.json()) as {
      data: { items: Array<{ alias: string }> };
    };
    const aliases = env.data.items.map((x) => x.alias).sort();
    expect(aliases).toEqual(["shipping"]); // returns is draft → filtered
  });

  test("tag endpoint scopes across types but only published", async () => {
    const res = await app.request("/api/v1/client/cms/tag/help", {
      headers: { "x-api-key": cpk },
    });
    expect(res.status).toBe(200);
    const env = (await res.json()) as {
      data: { items: Array<{ alias: string }> };
    };
    const aliases = env.data.items.map((x) => x.alias).sort();
    expect(aliases).toEqual(["shipping"]); // returns is draft
  });

  test("list endpoint returns all published of a type", async () => {
    const res = await app.request("/api/v1/client/cms/list/faq", {
      headers: { "x-api-key": cpk },
    });
    expect(res.status).toBe(200);
    const env = (await res.json()) as {
      data: { items: Array<{ alias: string }> };
    };
    const aliases = env.data.items.map((x) => x.alias).sort();
    expect(aliases).toEqual(["billing", "shipping"]); // returns is draft
  });

  test("list endpoint accepts groupKey and tag query filters", async () => {
    const res = await app.request(
      "/api/v1/client/cms/list/faq?groupKey=billing",
      { headers: { "x-api-key": cpk } },
    );
    expect(res.status).toBe(200);
    const env = (await res.json()) as {
      data: { items: Array<{ alias: string }> };
    };
    const aliases = env.data.items.map((x) => x.alias).sort();
    expect(aliases).toEqual(["billing"]);
  });
});
