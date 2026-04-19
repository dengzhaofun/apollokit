import { describe, expect, test } from "vitest";
import {
  generateInviteCode,
  formatInviteCode,
  normalizeInviteCode,
  isWellFormedInviteCode,
} from "./code";

describe("invite code", () => {
  test("generated code only uses unambiguous alphabet (no 0/1/I/L/O)", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateInviteCode(8);
      expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]+$/);
      expect(code).toHaveLength(8);
    }
  });

  test("generateInviteCode default length is 8", () => {
    expect(generateInviteCode()).toHaveLength(8);
  });

  test("generateInviteCode accepts multiple-of-4 lengths", () => {
    expect(generateInviteCode(4)).toHaveLength(4);
    expect(generateInviteCode(12)).toHaveLength(12);
    expect(generateInviteCode(16)).toHaveLength(16);
  });

  test("generateInviteCode rejects non-multiple-of-4 lengths", () => {
    expect(() => generateInviteCode(5)).toThrow();
    expect(() => generateInviteCode(0)).toThrow();
    expect(() => generateInviteCode(-4)).toThrow();
  });

  test("formatInviteCode inserts '-' every 4 chars", () => {
    expect(formatInviteCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(formatInviteCode("ABCD")).toBe("ABCD");
    expect(formatInviteCode("ABCDEFGHJKLM")).toBe("ABCD-EFGH-JKLM");
  });

  test("normalizeInviteCode upper-cases, trims, and strips dashes/spaces", () => {
    expect(normalizeInviteCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeInviteCode("  abcd efgh  ")).toBe("ABCDEFGH");
    expect(normalizeInviteCode("AB-CD-EF-GH")).toBe("ABCDEFGH");
  });

  test("isWellFormedInviteCode accepts valid alphabet + length multiple of 4", () => {
    expect(isWellFormedInviteCode("ABCDEFGH")).toBe(true);
    expect(isWellFormedInviteCode("abcd-efgh")).toBe(true);
    expect(isWellFormedInviteCode("2345")).toBe(true);
  });

  test("isWellFormedInviteCode rejects ambiguous chars 0/1/I/L/O", () => {
    expect(isWellFormedInviteCode("ABCD0EFG")).toBe(false);
    expect(isWellFormedInviteCode("ABCD1EFG")).toBe(false);
    expect(isWellFormedInviteCode("ABCDIEFG")).toBe(false);
    expect(isWellFormedInviteCode("ABCDLEFG")).toBe(false);
    expect(isWellFormedInviteCode("ABCDOEFG")).toBe(false);
  });

  test("isWellFormedInviteCode rejects empty and non-multiple-of-4", () => {
    expect(isWellFormedInviteCode("")).toBe(false);
    expect(isWellFormedInviteCode("ABC")).toBe(false);
    expect(isWellFormedInviteCode("ABCDE")).toBe(false);
  });

  test("isWellFormedInviteCode rejects lengths > 24 after normalize", () => {
    expect(isWellFormedInviteCode("ABCDEFGHABCDEFGHABCDEFGHABCD")).toBe(false);
  });
});
