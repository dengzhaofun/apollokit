import { describe, expect, test } from "vitest";

import { DEMO_PROJECT_FIXTURE } from "./fixtures";
import { loadProjectBySlug, resolveSlugFromHost } from "./load-project";

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
  });

  test("respects custom baseDomain", () => {
    expect(resolveSlugFromHost("foo.pages.example.test", "pages.example.test")).toBe(
      "foo",
    );
    expect(
      resolveSlugFromHost("foo.pages.apollokit.dev", "pages.example.test"),
    ).toBeNull();
  });
});

describe("loadProjectBySlug", () => {
  test("returns demo fixture for slug=demo", async () => {
    const result = await loadProjectBySlug("demo");
    expect(result).not.toBeNull();
    expect(result?.slug).toBe("demo");
    expect(result?.schema).toBe(DEMO_PROJECT_FIXTURE);
    expect(result?.versionId).toBe("fixture-v1");
  });

  test("returns null for unknown slugs", async () => {
    expect(await loadProjectBySlug("nope")).toBeNull();
    expect(await loadProjectBySlug("")).toBeNull();
  });
});
