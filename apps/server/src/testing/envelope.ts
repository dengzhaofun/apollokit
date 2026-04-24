/**
 * Test helpers for the standard response envelope.
 *
 * Every business route returns `{ code, data, message, requestId }` —
 * see `src/lib/response.ts`. Route-layer tests want to drill into the
 * payload (`data`) while asserting the envelope is shaped correctly.
 *
 * Usage:
 *
 *   const cfg = await expectOk<{ id: string; alias: string }>(res);
 *   expect(cfg.alias).toBe("route-happy");
 *
 *   await expectFail(res, "check_in.config_not_found");
 *
 * HTTP status assertions stay at the call site — helpers don't touch
 * `res.status` to avoid hiding mismatches behind opaque messages.
 */
import { expect } from "vitest";

type OkBody<T> = {
  code: "ok";
  data: T;
  message: string;
  requestId: string;
};

type ErrBody = {
  code: string;
  data: null;
  message: string;
  requestId: string;
};

export async function expectOk<T = unknown>(res: Response): Promise<T> {
  const body = (await res.json()) as OkBody<T>;
  expect(body.code).toBe("ok");
  expect(typeof body.requestId).toBe("string");
  return body.data;
}

export async function expectFail(
  res: Response,
  code: string,
): Promise<{ message: string; requestId: string }> {
  const body = (await res.json()) as ErrBody;
  expect(body.code).toBe(code);
  expect(body.data).toBeNull();
  return { message: body.message, requestId: body.requestId };
}
