import { afterEach, describe, expect, test } from "vitest";

import { getMention, listMentionTypes, registerMention } from "./registry";
import type { MentionDescriptor } from "./types";

/**
 * Registry tests are pure-logic — no DB. They exercise register / lookup /
 * list / re-register and don't touch the production descriptors that
 * `mentions/index.ts` would otherwise pull in (we never import the barrel).
 */

function fakeDescriptor(type: string): MentionDescriptor {
  return {
    type,
    label: `${type}-label`,
    toolModuleId: null,
    async search() {
      return [];
    },
    async fetch() {
      return null;
    },
    toResult(item) {
      return { type, id: "x", name: "x", alias: null, subtitle: null };
    },
    toContextLine() {
      return `[${type}] x`;
    },
  };
}

const TEST_TYPES = ["__t1", "__t2"];

afterEach(() => {
  // Best-effort cleanup: the registry has no `unregister` API (intentional —
  // production never unregisters), but we use distinct prefixed names so
  // they don't collide with real descriptors. Subsequent tests overwrite
  // the same names, so leftover state doesn't leak across tests.
  for (const t of TEST_TYPES) {
    registerMention({ ...fakeDescriptor(t), label: "stale" });
  }
});

describe("mention registry", () => {
  test("registers + retrieves by type", () => {
    const d = fakeDescriptor("__t1");
    registerMention(d);
    const got = getMention("__t1");
    expect(got).toBeDefined();
    expect(got!.label).toBe("__t1-label");
  });

  test("re-register overwrites silently (idempotent for HMR)", () => {
    registerMention(fakeDescriptor("__t1"));
    registerMention({ ...fakeDescriptor("__t1"), label: "new-label" });
    expect(getMention("__t1")!.label).toBe("new-label");
  });

  test("getMention returns undefined for unknown types", () => {
    expect(getMention("__nonexistent_type__")).toBeUndefined();
  });

  test("listMentionTypes includes registered types", () => {
    registerMention(fakeDescriptor("__t1"));
    registerMention(fakeDescriptor("__t2"));
    const types = listMentionTypes();
    expect(types).toContain("__t1");
    expect(types).toContain("__t2");
  });
});
