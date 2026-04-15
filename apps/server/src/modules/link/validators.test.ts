/**
 * Pure unit tests for LinkActionSchema — no DB needed.
 *
 * Covers:
 *   - the discriminated union's three branches
 *   - each branch's constraints (URL scheme, registry lookup, per-route
 *     params schema)
 *   - that pending routes validate just like active ones
 */

import { describe, expect, test } from "vitest";

import { LinkActionSchema } from "./validators";

describe("LinkActionSchema", () => {
  test("accepts type=none", () => {
    const result = LinkActionSchema.safeParse({ type: "none" });
    expect(result.success).toBe(true);
  });

  test("accepts https external url", () => {
    const result = LinkActionSchema.safeParse({
      type: "external",
      url: "https://example.com/promo",
      openIn: "_blank",
    });
    expect(result.success).toBe(true);
  });

  test("rejects non-http(s) external url", () => {
    const result = LinkActionSchema.safeParse({
      type: "external",
      url: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });

  test("accepts internal shop.product with a valid uuid", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    const result = LinkActionSchema.safeParse({
      type: "internal",
      route: "shop.product",
      params: { productId: uuid },
    });
    expect(result.success).toBe(true);
  });

  test("rejects internal shop.product with a non-uuid productId", () => {
    const result = LinkActionSchema.safeParse({
      type: "internal",
      route: "shop.product",
      params: { productId: "not-a-uuid" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects internal shop.product when params are missing", () => {
    const result = LinkActionSchema.safeParse({
      type: "internal",
      route: "shop.product",
    });
    expect(result.success).toBe(false);
  });

  test("rejects unknown internal route", () => {
    const result = LinkActionSchema.safeParse({
      type: "internal",
      route: "totally.made.up",
    });
    expect(result.success).toBe(false);
  });

  test("accepts mail.inbox with no params", () => {
    const result = LinkActionSchema.safeParse({
      type: "internal",
      route: "mail.inbox",
    });
    expect(result.success).toBe(true);
  });

  test("rejects mail.inbox with unexpected params (strict)", () => {
    const result = LinkActionSchema.safeParse({
      type: "internal",
      route: "mail.inbox",
      params: { foo: "bar" },
    });
    expect(result.success).toBe(false);
  });

  test("accepts dialogue.script with scriptAlias", () => {
    const result = LinkActionSchema.safeParse({
      type: "internal",
      route: "dialogue.script",
      params: { scriptAlias: "home-tutorial" },
    });
    expect(result.success).toBe(true);
  });

  test("accepts a pending route (registry status='pending')", () => {
    // guild.detail is status=pending — write-time validation still accepts
    // so operators can stage links ahead of module launch.
    const uuid = "22222222-2222-4222-8222-222222222222";
    const result = LinkActionSchema.safeParse({
      type: "internal",
      route: "guild.detail",
      params: { guildId: uuid },
    });
    expect(result.success).toBe(true);
  });

  test("discriminator enforced — missing type rejected", () => {
    const result = LinkActionSchema.safeParse({
      url: "https://example.com",
    });
    expect(result.success).toBe(false);
  });
});
