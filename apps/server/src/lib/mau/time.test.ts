import { describe, expect, test } from "vitest";

import {
  currentYearMonth,
  periodStartFromYearMonth,
  previousYearMonth,
} from "./time";

describe("mau time helpers", () => {
  test("currentYearMonth uses UTC month, not local", () => {
    // 2026-05-31 23:30 UTC is still May 2026 even though Asia/Shanghai
    // would already be June 1.
    const utcMay = new Date(Date.UTC(2026, 4, 31, 23, 30));
    expect(currentYearMonth(utcMay)).toBe("2026-05");
  });

  test("currentYearMonth pads month to two digits", () => {
    expect(currentYearMonth(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-01");
    expect(currentYearMonth(new Date(Date.UTC(2026, 8, 1)))).toBe("2026-09");
  });

  test("previousYearMonth wraps the year correctly", () => {
    const jan = new Date(Date.UTC(2026, 0, 1));
    expect(previousYearMonth(jan)).toBe("2025-12");
    const dec = new Date(Date.UTC(2026, 11, 1));
    expect(previousYearMonth(dec)).toBe("2026-11");
  });

  test("periodStartFromYearMonth returns UTC-midnight first-of-month", () => {
    const d = periodStartFromYearMonth("2026-05");
    expect(d.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  test("periodStartFromYearMonth rejects malformed input", () => {
    expect(() => periodStartFromYearMonth("nope")).toThrow();
    expect(() => periodStartFromYearMonth("2026-13")).toThrow();
  });
});
