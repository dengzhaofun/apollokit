import { describe, expect, test } from "vitest";

import { createAgentForRequest } from "./registry";
import { isAdminAgentName } from "./types";
import type { ChatExecutionContext } from "../types";

const EXEC_CTX: ChatExecutionContext = { tenantId: "org-test" };

describe("isAdminAgentName", () => {
  test("accepts known agent names", () => {
    expect(isAdminAgentName("form-fill")).toBe(true);
    expect(isAdminAgentName("global-assistant")).toBe(true);
  });

  test("rejects unknown / non-string values", () => {
    expect(isAdminAgentName("admin")).toBe(false);
    expect(isAdminAgentName("FORM-FILL")).toBe(false);
    expect(isAdminAgentName("")).toBe(false);
    expect(isAdminAgentName(null)).toBe(false);
    expect(isAdminAgentName(undefined)).toBe(false);
    expect(isAdminAgentName({ name: "form-fill" })).toBe(false);
    expect(isAdminAgentName(42)).toBe(false);
  });
});

describe("createAgentForRequest", () => {
  test("returns the form-fill definition with correct name", () => {
    const def = createAgentForRequest("form-fill", EXEC_CTX);
    expect(def.name).toBe("form-fill");
    expect(typeof def.buildSystem).toBe("function");
    expect(typeof def.buildTools).toBe("function");
  });

  test("returns the global-assistant definition with correct name", () => {
    const def = createAgentForRequest("global-assistant", EXEC_CTX);
    expect(def.name).toBe("global-assistant");
    expect(typeof def.buildSystem).toBe("function");
    expect(typeof def.buildTools).toBe("function");
  });

  test("form-fill exposes propose-only patch tools (no execute) on mention", () => {
    const def = createAgentForRequest("form-fill", EXEC_CTX);
    const tools = def.buildTools({
      surface: "dashboard",
      mentionedModuleIds: ["check-in"],
    });
    expect("patchCheckInConfig" in tools).toBe(true);
    expect("execute" in tools.patchCheckInConfig!).toBe(false);
  });

  test("global-assistant exposes propose-only patch tools on mention", () => {
    // Global-assistant uses the propose variant (same as form-fill) for
    // safety: LLMs hallucinate extra patch fields and would destructively
    // overwrite values the user never asked to change. The frontend's
    // PatchConfigCard gates every write behind a one-click confirm.
    const def = createAgentForRequest("global-assistant", EXEC_CTX);
    const tools = def.buildTools({
      surface: "dashboard",
      mentionedModuleIds: ["check-in"],
    });
    expect("patchCheckInConfig" in tools).toBe(true);
    expect("execute" in tools.patchCheckInConfig!).toBe(false);
  });

  test("global-assistant does NOT expose apply tools (create stays in form-fill)", () => {
    const def = createAgentForRequest("global-assistant", EXEC_CTX);
    const tools = def.buildTools({
      surface: "check-in:create",
      mentionedModuleIds: ["check-in"],
    });
    const applyNames = Object.keys(tools).filter((n) => n.startsWith("apply"));
    expect(applyNames).toEqual([]);
  });

  test("form-fill exposes the surface-bound apply tool on :create", () => {
    const def = createAgentForRequest("form-fill", EXEC_CTX);
    const tools = def.buildTools({
      surface: "check-in:create",
      mentionedModuleIds: [],
    });
    expect("applyCheckInConfig" in tools).toBe(true);
  });
});
