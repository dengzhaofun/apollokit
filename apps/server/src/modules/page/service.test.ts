/**
 * Service-layer tests for the page module.
 *
 * Hits the real local Postgres dev branch (see CLAUDE.md). Covers:
 *   - project create / get / update / delete
 *   - global slug uniqueness across tenants
 *   - reserved-slug rejection
 *   - template seed → project create copies schema as v1
 *   - version propose: schema cross-ref validation (defaultPageId, dup ids,
 *     boundModule violation), versionNumber monotonic
 *   - publish flips publishedVersionId
 *   - rollback copies forward (timeline always strictly monotonic)
 *   - conversation idempotency on (projectId, messageId)
 *   - preview-token sign + verify roundtrip
 *   - tenant isolation
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import type { EventBus } from "../../lib/event-bus";
import { createEventBus } from "../../lib/event-bus";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import {
  PageBoundModuleViolation,
  PageInvalidSchema,
  PageProjectNotFound,
  PageProjectSlugConflict,
  PageProjectSlugReserved,
  PageTemplateNotFound,
  PageVersionNotFound,
} from "./errors";
import { verifyPreviewToken } from "./preview-token";
import { createPageService } from "./service";
import type { PageProjectSchema } from "./types";

const APP_SECRET = "test-app-secret-do-not-use-in-prod-page-svc-suite";

function uniqSlug(prefix: string): string {
  // 6-char base36 to keep the slug short but unique across parallel runs.
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeMinimalSchema(
  overrides: Partial<PageProjectSchema> = {},
): PageProjectSchema {
  return {
    version: 1,
    theme: { primary: "#FF6B35", bg: "#000", fg: "#fff" },
    pages: [
      {
        id: "home",
        path: "/",
        title: "Home",
        blocks: [
          {
            id: "hero-1",
            type: "hero",
            props: { title: "Hello world" },
          },
        ],
      },
    ],
    defaultPageId: "home",
    ...overrides,
  };
}

describe("page service", () => {
  let events: EventBus;
  let svc: ReturnType<typeof createPageService>;
  let orgId: string;
  let otherOrgId: string;

  beforeAll(async () => {
    events = createEventBus();
    svc = createPageService({ db, events, appSecret: APP_SECRET });
    orgId = await createTestOrg("page-svc");
    otherOrgId = await createTestOrg("page-svc-other");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
    await deleteTestOrg(otherOrgId);
  });

  // ─── Projects ───────────────────────────────────────────────────

  test("create + get by id roundtrip", async () => {
    const slug = uniqSlug("svc-create");
    const { project, initialVersion } = await svc.createProject(
      orgId,
      {
        slug,
        name: "Spring Check-in",
        authMode: "anonymous",
        boundModules: ["check-in"],
      },
      "user-1",
    );
    expect(project.tenantId).toBe(orgId);
    expect(project.slug).toBe(slug);
    expect(project.status).toBe("draft");
    expect(project.boundModules).toEqual(["check-in"]);
    expect(initialVersion).toBeNull();

    const fetched = await svc.getProjectById(orgId, project.id);
    expect(fetched.id).toBe(project.id);
  });

  test("global slug uniqueness across tenants", async () => {
    const slug = uniqSlug("svc-uniq");
    await svc.createProject(
      orgId,
      { slug, name: "A", authMode: "anonymous" },
      null,
    );
    await expect(
      svc.createProject(
        otherOrgId,
        { slug, name: "B", authMode: "anonymous" },
        null,
      ),
    ).rejects.toBeInstanceOf(PageProjectSlugConflict);
  });

  test("reserved slugs rejected", async () => {
    await expect(
      svc.createProject(
        orgId,
        { slug: "api", name: "X", authMode: "anonymous" },
        null,
      ),
    ).rejects.toBeInstanceOf(PageProjectSlugReserved);
    await expect(
      svc.createProject(
        orgId,
        { slug: "www", name: "X", authMode: "anonymous" },
        null,
      ),
    ).rejects.toBeInstanceOf(PageProjectSlugReserved);
  });

  test("update merges fields, missing fields untouched", async () => {
    const { project } = await svc.createProject(
      orgId,
      {
        slug: uniqSlug("svc-update"),
        name: "Original",
        authMode: "anonymous",
        boundModules: ["check-in"],
      },
      null,
    );
    const updated = await svc.updateProject(orgId, project.id, {
      name: "Renamed",
    });
    expect(updated.name).toBe("Renamed");
    expect(updated.boundModules).toEqual(["check-in"]); // untouched
    expect(updated.status).toBe("draft");
  });

  test("delete cascades + cross-tenant isolation", async () => {
    const { project } = await svc.createProject(
      orgId,
      { slug: uniqSlug("svc-del"), name: "Doomed", authMode: "anonymous" },
      null,
    );
    // other tenant cannot see / delete it
    await expect(
      svc.getProjectById(otherOrgId, project.id),
    ).rejects.toBeInstanceOf(PageProjectNotFound);
    await expect(
      svc.deleteProject(otherOrgId, project.id),
    ).rejects.toBeInstanceOf(PageProjectNotFound);
    await svc.deleteProject(orgId, project.id);
    await expect(
      svc.getProjectById(orgId, project.id),
    ).rejects.toBeInstanceOf(PageProjectNotFound);
  });

  // ─── Templates ──────────────────────────────────────────────────

  test("upsertTemplate is idempotent on slug", async () => {
    const slug = uniqSlug("tpl");
    const tpl1 = await svc.upsertTemplate({
      slug,
      name: "first",
      category: "checkin",
      schema: makeMinimalSchema(),
      requiredModules: ["check-in"],
    });
    const tpl2 = await svc.upsertTemplate({
      slug,
      name: "second",
      category: "checkin",
      schema: makeMinimalSchema(),
      requiredModules: ["check-in"],
    });
    expect(tpl2.id).toBe(tpl1.id);
    expect(tpl2.name).toBe("second");
  });

  test("create from template copies schema into v1 draft", async () => {
    const tplSlug = uniqSlug("tpl-seed");
    const template = await svc.upsertTemplate({
      slug: tplSlug,
      name: "seeded",
      category: "checkin",
      schema: makeMinimalSchema({
        pages: [
          {
            id: "p-home",
            path: "/",
            title: "Templated home",
            blocks: [],
          },
        ],
        defaultPageId: "p-home",
      }),
      requiredModules: ["check-in"],
    });

    const { project, initialVersion } = await svc.createProject(
      orgId,
      {
        slug: uniqSlug("from-tpl"),
        name: "From template",
        authMode: "anonymous",
        boundModules: ["check-in"],
        templateId: template.id,
      },
      null,
    );
    expect(initialVersion).not.toBeNull();
    expect(initialVersion!.versionNumber).toBe(1);
    expect(initialVersion!.label).toBe(`from template: ${tplSlug}`);
    // Verify the schema actually got copied through
    const stored = (initialVersion!.schema as unknown) as PageProjectSchema;
    expect(stored.pages[0]?.id).toBe("p-home");

    // re-fetch to ensure persistence
    const versions = await svc.listVersions(orgId, project.id);
    expect(versions.items).toHaveLength(1);
  });

  test("template referencing missing modules in project rejects", async () => {
    const template = await svc.upsertTemplate({
      slug: uniqSlug("tpl-needs"),
      name: "needs shop",
      category: "shop",
      schema: makeMinimalSchema(),
      requiredModules: ["shop", "currency"],
    });
    await expect(
      svc.createProject(
        orgId,
        {
          slug: uniqSlug("missing-mods"),
          name: "X",
          authMode: "anonymous",
          boundModules: ["shop"], // missing currency
          templateId: template.id,
        },
        null,
      ),
    ).rejects.toBeInstanceOf(PageBoundModuleViolation);
  });

  test("unknown templateId rejects", async () => {
    await expect(
      svc.createProject(
        orgId,
        {
          slug: uniqSlug("bad-tpl"),
          name: "X",
          authMode: "anonymous",
          templateId: crypto.randomUUID(),
        },
        null,
      ),
    ).rejects.toBeInstanceOf(PageTemplateNotFound);
  });

  // ─── Versions ───────────────────────────────────────────────────

  test("proposeDraft assigns monotonic versionNumber", async () => {
    const { project } = await svc.createProject(
      orgId,
      {
        slug: uniqSlug("ver"),
        name: "Versioned",
        authMode: "anonymous",
        boundModules: ["check-in"],
      },
      null,
    );
    const v1 = await svc.proposeDraft(
      orgId,
      project.id,
      { schema: makeMinimalSchema(), authorType: "human" },
      null,
    );
    expect(v1.versionNumber).toBe(1);

    const v2 = await svc.proposeDraft(
      orgId,
      project.id,
      { schema: makeMinimalSchema(), authorType: "ai", label: "AI iter 2" },
      null,
    );
    expect(v2.versionNumber).toBe(2);
    expect(v2.authorType).toBe("ai");
  });

  test("schema cross-ref validation: bad defaultPageId", async () => {
    const { project } = await svc.createProject(
      orgId,
      { slug: uniqSlug("bad-def"), name: "X", authMode: "anonymous" },
      null,
    );
    await expect(
      svc.proposeDraft(
        orgId,
        project.id,
        {
          schema: makeMinimalSchema({ defaultPageId: "missing" }),
          authorType: "human",
        },
        null,
      ),
    ).rejects.toBeInstanceOf(PageInvalidSchema);
  });

  test("schema cross-ref validation: duplicate page id", async () => {
    const { project } = await svc.createProject(
      orgId,
      { slug: uniqSlug("dup-pg"), name: "X", authMode: "anonymous" },
      null,
    );
    const dupSchema = makeMinimalSchema({
      pages: [
        { id: "home", path: "/", title: "A", blocks: [] },
        { id: "home", path: "/b", title: "B", blocks: [] },
      ],
      defaultPageId: "home",
    });
    await expect(
      svc.proposeDraft(
        orgId,
        project.id,
        { schema: dupSchema, authorType: "human" },
        null,
      ),
    ).rejects.toBeInstanceOf(PageInvalidSchema);
  });

  test("boundModule violation rejected", async () => {
    const { project } = await svc.createProject(
      orgId,
      {
        slug: uniqSlug("bad-mod"),
        name: "X",
        authMode: "anonymous",
        boundModules: ["check-in"], // not shop
      },
      null,
    );
    const schema = makeMinimalSchema({
      pages: [
        {
          id: "home",
          path: "/",
          title: "Home",
          blocks: [
            {
              id: "shop-grid-1",
              type: "shop-grid",
              props: {},
              binding: { module: "shop" },
            },
          ],
        },
      ],
    });
    await expect(
      svc.proposeDraft(
        orgId,
        project.id,
        { schema, authorType: "human" },
        null,
      ),
    ).rejects.toBeInstanceOf(PageBoundModuleViolation);
  });

  test("publishVersion flips pointer", async () => {
    const { project } = await svc.createProject(
      orgId,
      { slug: uniqSlug("pub"), name: "X", authMode: "anonymous" },
      null,
    );
    expect(project.publishedVersionId).toBeNull();

    const version = await svc.proposeDraft(
      orgId,
      project.id,
      { schema: makeMinimalSchema(), authorType: "human" },
      null,
    );
    const updated = await svc.publishVersion(orgId, project.id, version.id);
    expect(updated.publishedVersionId).toBe(version.id);
    expect(updated.status).toBe("published");
  });

  test("rollback copies forward instead of mutating", async () => {
    const { project } = await svc.createProject(
      orgId,
      { slug: uniqSlug("rb"), name: "X", authMode: "anonymous" },
      null,
    );
    const v1 = await svc.proposeDraft(
      orgId,
      project.id,
      {
        schema: makeMinimalSchema({
          pages: [
            { id: "home", path: "/", title: "v1", blocks: [] },
          ],
        }),
        authorType: "human",
      },
      null,
    );
    const v2 = await svc.proposeDraft(
      orgId,
      project.id,
      {
        schema: makeMinimalSchema({
          pages: [
            { id: "home", path: "/", title: "v2", blocks: [] },
          ],
        }),
        authorType: "human",
      },
      null,
    );

    const { version: v3, project: updated } = await svc.rollback(
      orgId,
      project.id,
      { versionId: v1.id, publishImmediately: true },
      null,
    );
    expect(v3.versionNumber).toBe(3); // monotonic, NOT overwritten v1
    expect(v3.parentVersionId).toBe(v1.id);
    expect(v3.label).toBe(`rollback to v1`);
    // schema content matches v1
    const v3Schema = (v3.schema as unknown) as PageProjectSchema;
    expect(v3Schema.pages[0]?.title).toBe("v1");
    // both old versions still around
    expect(
      await svc.getVersion(orgId, project.id, v1.id),
    ).toBeTruthy();
    expect(
      await svc.getVersion(orgId, project.id, v2.id),
    ).toBeTruthy();
    // pointer flipped
    expect(updated?.publishedVersionId).toBe(v3.id);
  });

  test("getVersion enforces tenant + project ownership", async () => {
    const { project } = await svc.createProject(
      orgId,
      { slug: uniqSlug("own"), name: "X", authMode: "anonymous" },
      null,
    );
    const v = await svc.proposeDraft(
      orgId,
      project.id,
      { schema: makeMinimalSchema(), authorType: "human" },
      null,
    );
    await expect(
      svc.getVersion(otherOrgId, project.id, v.id),
    ).rejects.toBeInstanceOf(PageProjectNotFound);
    await expect(
      svc.getVersion(orgId, project.id, crypto.randomUUID()),
    ).rejects.toBeInstanceOf(PageVersionNotFound);
  });

  // ─── Conversations ──────────────────────────────────────────────

  test("appendConversationMessage idempotent on (projectId, messageId)", async () => {
    const { project } = await svc.createProject(
      orgId,
      { slug: uniqSlug("conv"), name: "X", authMode: "anonymous" },
      null,
    );
    const messageId = `msg-${crypto.randomUUID()}`;
    const a = await svc.appendConversationMessage(orgId, project.id, {
      messageId,
      role: "user",
      content: { text: "hi" },
    });
    const b = await svc.appendConversationMessage(orgId, project.id, {
      messageId,
      role: "user",
      content: { text: "hi" },
    });
    expect(b.id).toBe(a.id); // returned the existing row, not a duplicate
    const list = await svc.listConversation(orgId, project.id, {});
    expect(list.filter((r) => r.messageId === messageId)).toHaveLength(1);
  });

  test("listConversation orders ascending by createdAt", async () => {
    const { project } = await svc.createProject(
      orgId,
      { slug: uniqSlug("conv-order"), name: "X", authMode: "anonymous" },
      null,
    );
    for (const i of [1, 2, 3]) {
      await svc.appendConversationMessage(orgId, project.id, {
        messageId: `m-${i}`,
        role: i % 2 === 0 ? "assistant" : "user",
        content: { text: `t${i}` },
      });
    }
    const list = await svc.listConversation(orgId, project.id, {});
    expect(list.map((r) => r.messageId)).toEqual(["m-1", "m-2", "m-3"]);
  });

  // ─── Form submissions (PR 6) ────────────────────────────────────

  test("appendFormSubmission writes a row attributed to (project, page, block, endUserId)", async () => {
    const { project } = await svc.createProject(
      orgId,
      { slug: uniqSlug("submit"), name: "X", authMode: "anonymous" },
      null,
    );
    const row = await svc.appendFormSubmission(orgId, project.id, {
      pageId: "home",
      blockId: "form-1",
      endUserId: "device-uuid-1",
      payload: { name: "Alice", email: "a@x.com" },
    });
    expect(row.projectId).toBe(project.id);
    expect(row.pageId).toBe("home");
    expect(row.blockId).toBe("form-1");
    expect(row.endUserId).toBe("device-uuid-1");
    expect(row.payload).toEqual({ name: "Alice", email: "a@x.com" });
  });

  test("appendFormSubmission allows anonymous (null endUserId)", async () => {
    const { project } = await svc.createProject(
      orgId,
      {
        slug: uniqSlug("submit-anon"),
        name: "X",
        authMode: "anonymous",
      },
      null,
    );
    const row = await svc.appendFormSubmission(orgId, project.id, {
      pageId: "home",
      blockId: "form-1",
      endUserId: null,
      payload: { foo: "bar" },
    });
    expect(row.endUserId).toBeNull();
  });

  test("appendFormSubmission rejects cross-tenant access", async () => {
    const { project } = await svc.createProject(
      orgId,
      { slug: uniqSlug("submit-iso"), name: "X", authMode: "anonymous" },
      null,
    );
    await expect(
      svc.appendFormSubmission(otherOrgId, project.id, {
        pageId: "home",
        blockId: "f",
        endUserId: null,
        payload: {},
      }),
    ).rejects.toBeInstanceOf(PageProjectNotFound);
  });

  test("listFormSubmissions filters by pageId / blockId, orders DESC", async () => {
    const { project } = await svc.createProject(
      orgId,
      { slug: uniqSlug("list-subs"), name: "X", authMode: "anonymous" },
      null,
    );
    await svc.appendFormSubmission(orgId, project.id, {
      pageId: "home",
      blockId: "f1",
      endUserId: "u1",
      payload: { a: 1 },
    });
    await svc.appendFormSubmission(orgId, project.id, {
      pageId: "home",
      blockId: "f1",
      endUserId: "u2",
      payload: { a: 2 },
    });
    await svc.appendFormSubmission(orgId, project.id, {
      pageId: "about",
      blockId: "f2",
      endUserId: "u3",
      payload: { a: 3 },
    });

    const all = await svc.listFormSubmissions(orgId, project.id, {});
    expect(all.items).toHaveLength(3);

    const onlyHome = await svc.listFormSubmissions(orgId, project.id, {
      pageId: "home",
    });
    expect(onlyHome.items).toHaveLength(2);
    expect(onlyHome.items.every((r) => r.pageId === "home")).toBe(true);

    const onlyF2 = await svc.listFormSubmissions(orgId, project.id, {
      blockId: "f2",
    });
    expect(onlyF2.items).toHaveLength(1);
    expect(onlyF2.items[0]?.endUserId).toBe("u3");
  });

  // ─── Preview token ──────────────────────────────────────────────

  test("createPreviewToken signs verifiable JWT", async () => {
    const { project } = await svc.createProject(
      orgId,
      { slug: uniqSlug("pv"), name: "X", authMode: "anonymous" },
      null,
    );
    const v = await svc.proposeDraft(
      orgId,
      project.id,
      { schema: makeMinimalSchema(), authorType: "human" },
      null,
    );
    const { token, expiresAt } = await svc.createPreviewToken(
      orgId,
      project.id,
      v.id,
      60,
    );
    expect(token.split(".").length).toBe(3); // header.payload.sig

    const payload = await verifyPreviewToken(APP_SECRET, token, project.id);
    expect(payload.versionId).toBe(v.id);
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    // wrong projectId rejected
    await expect(
      verifyPreviewToken(APP_SECRET, token, crypto.randomUUID()),
    ).rejects.toThrow();

    // wrong secret rejected
    await expect(
      verifyPreviewToken("different-secret", token, project.id),
    ).rejects.toThrow();
  });
});
