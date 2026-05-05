import { describe, expect, test, vi } from "vitest";

import { DEMO_PROJECT_FIXTURE } from "./fixtures";
import {
  loadProjectBySlug,
  resolveSlugFromHost,
  resolveSlugFromPath,
} from "./load-project";

describe("resolveSlugFromHost", () => {
  test("extracts slug from prod wildcard host", () => {
    expect(resolveSlugFromHost("demo.pages.apollokit.dev")).toBe("demo");
    expect(resolveSlugFromHost("spring-checkin.pages.apollokit.dev")).toBe(
      "spring-checkin",
    );
  });

  test("strips port for dev hosts", () => {
    expect(resolveSlugFromHost("demo.localhost:3001")).toBe("demo");
    expect(resolveSlugFromHost("demo.lvh.me:3001")).toBe("demo");
  });

  test("returns null for apex / unknown hosts", () => {
    expect(resolveSlugFromHost("pages.apollokit.dev")).toBeNull();
    expect(resolveSlugFromHost("apollokit.dev")).toBeNull();
    expect(resolveSlugFromHost("example.com")).toBeNull();
    // workers.dev — falls through to path mode
    expect(
      resolveSlugFromHost("apollokit-pages.acme.workers.dev"),
    ).toBeNull();
  });

  test("respects custom baseDomain", () => {
    expect(
      resolveSlugFromHost("foo.pages.example.test", "pages.example.test"),
    ).toBe("foo");
    expect(
      resolveSlugFromHost("foo.pages.apollokit.dev", "pages.example.test"),
    ).toBeNull();
  });
});

describe("resolveSlugFromPath", () => {
  test("first segment is slug, rest is pagePath", () => {
    expect(resolveSlugFromPath("/spring-checkin")).toEqual({
      slug: "spring-checkin",
      pagePath: "/",
    });
    expect(resolveSlugFromPath("/spring-checkin/")).toEqual({
      slug: "spring-checkin",
      pagePath: "/",
    });
    expect(resolveSlugFromPath("/spring-checkin/about")).toEqual({
      slug: "spring-checkin",
      pagePath: "/about",
    });
    expect(resolveSlugFromPath("/spring/foo/bar")).toEqual({
      slug: "spring",
      pagePath: "/foo/bar",
    });
  });

  test("empty / root path returns null", () => {
    expect(resolveSlugFromPath("/")).toBeNull();
    expect(resolveSlugFromPath("")).toBeNull();
  });

  test("reserved prefixes return null (route file precedence)", () => {
    expect(resolveSlugFromPath("/preview/abc")).toBeNull();
    expect(resolveSlugFromPath("/sitemap.xml")).toBeNull();
    expect(resolveSlugFromPath("/robots.txt")).toBeNull();
    expect(resolveSlugFromPath("/favicon.ico")).toBeNull();
    expect(resolveSlugFromPath("/api/foo")).toBeNull();
  });

  test("malformed slug returns null", () => {
    expect(resolveSlugFromPath("/-bad")).toBeNull();
    expect(resolveSlugFromPath("/bad-")).toBeNull();
    expect(resolveSlugFromPath("/double--hyphen")).toBeNull();
    expect(resolveSlugFromPath("/UPPER")).toBeNull();
    expect(resolveSlugFromPath("/with space")).toBeNull();
  });
});

describe("loadProjectBySlug", () => {
  test("returns demo fixture without touching env", async () => {
    const result = await loadProjectBySlug("demo");
    expect(result?.slug).toBe("demo");
    expect(result?.schema).toBe(DEMO_PROJECT_FIXTURE);
    expect(result?.versionId).toBe("fixture-v1");
  });

  test("returns null for unknown slug with no env bindings", async () => {
    expect(await loadProjectBySlug("nope")).toBeNull();
    expect(await loadProjectBySlug("")).toBeNull();
  });

  test("returns from KV cache when present", async () => {
    const fakeSchema = {
      version: 1,
      theme: { primary: "#000", bg: "#000", fg: "#fff" },
      pages: [{ id: "h", path: "/", title: "T", blocks: [] }],
      defaultPageId: "h",
    };
    const KV = {
      get: vi.fn().mockResolvedValue({
        project: { id: "p1", slug: "spring", publishedVersionId: "v1" },
        publishedVersion: { id: "v1", versionNumber: 1, schema: fakeSchema },
      }),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as KVNamespace;
    const result = await loadProjectBySlug("spring", { KV });
    expect(result?.fromCache).toBe(true);
    expect(result?.versionId).toBe("v1");
    expect(result?.schema).toEqual(fakeSchema);
    // API never called when KV hits
    expect(KV.get).toHaveBeenCalledOnce();
  });

  test("falls through to API service binding on KV miss", async () => {
    const fakeSchema = {
      version: 1,
      theme: { primary: "#fff", bg: "#000", fg: "#fff" },
      pages: [{ id: "h", path: "/", title: "T", blocks: [] }],
      defaultPageId: "h",
    };
    const KV = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
    } as unknown as KVNamespace;
    const API = {
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "ok",
            data: {
              project: {
                id: "p1",
                slug: "summer",
                name: "Summer",
                authMode: "anonymous",
                status: "published",
                publishedVersionId: "v9",
                settings: {},
              },
              publishedVersion: { id: "v9", versionNumber: 9, schema: fakeSchema },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    };
    const result = await loadProjectBySlug("summer", { KV, API });
    expect(API.fetch).toHaveBeenCalledOnce();
    expect(result?.fromCache).toBe(false);
    expect(result?.versionId).toBe("v9");
    // Best-effort cache fill happens
    expect(KV.put).toHaveBeenCalledOnce();
  });

  test("returns null when API responds with 404", async () => {
    const API = {
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    };
    const result = await loadProjectBySlug("ghost", { API });
    expect(result).toBeNull();
  });

  test("returns null when API throws", async () => {
    const API = {
      fetch: vi.fn().mockRejectedValue(new Error("network")),
    };
    const result = await loadProjectBySlug("explode", { API });
    expect(result).toBeNull();
  });
});
