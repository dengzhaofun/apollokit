import { afterEach, describe, expect, test } from "vitest";

import {
  __resetRegistryForTests,
  getInternalEvent,
  listInternalEvents,
  registerEvent,
} from "./event-registry";

describe("event-registry", () => {
  afterEach(() => __resetRegistryForTests());

  test("registers and lists in sorted order", () => {
    registerEvent({
      name: "zeta.one",
      owner: "zeta",
      description: "z",
      fields: [],
    });
    registerEvent({
      name: "alpha.one",
      owner: "alpha",
      description: "a",
      fields: [],
    });
    const names = listInternalEvents().map((e) => e.name);
    expect(names).toEqual(["alpha.one", "zeta.one"]);
  });

  test("forwardToTask defaults to true", () => {
    registerEvent({
      name: "x.y",
      owner: "x",
      description: "d",
      fields: [],
    });
    expect(getInternalEvent("x.y")?.forwardToTask).toBe(true);
  });

  test("forwardToTask=false is preserved", () => {
    registerEvent({
      name: "x.y",
      owner: "x",
      description: "d",
      fields: [],
      forwardToTask: false,
    });
    expect(getInternalEvent("x.y")?.forwardToTask).toBe(false);
  });

  test("re-registering the same name overwrites", () => {
    registerEvent({
      name: "a",
      owner: "old",
      description: "",
      fields: [],
    });
    registerEvent({
      name: "a",
      owner: "new",
      description: "",
      fields: [],
    });
    expect(getInternalEvent("a")?.owner).toBe("new");
  });

  test("getInternalEvent returns undefined for unknown name", () => {
    expect(getInternalEvent("nope")).toBeUndefined();
  });
});
