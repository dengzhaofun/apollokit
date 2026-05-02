/**
 * Verification dispatch — a pure function that takes a spot's declared
 * `verification` config plus the raw client-supplied check-in payload
 * and decides:
 *
 *   - which methods passed (`verifiedVia`)
 *   - which method failed first (when combinator='all')
 *   - the GPS distance in meters (so the log can record it for audit)
 *
 * No I/O lives in this file; the nonce-store and DB access happen in
 * the service. We pass the necessary side-effecting hooks in as a
 * tiny `VerifyContext` object so this file stays trivially testable.
 */

import { haversineMeters, isValidLatLng } from "./geo";
import { OfflineVerificationFailed } from "./errors";
import type {
  OfflineCheckInVerification,
  OfflineCheckInVerificationMethod,
  VerifiedKind,
} from "./types";

export type VerifyInput = {
  /** GPS coords reported by the client. */
  lat?: number;
  lng?: number;
  accuracyM?: number;
  /** One-time-token nonce, when verification.methods includes a QR step. */
  qrToken?: string;
  /** Manual staff-issued code, when verification.methods includes manual_code. */
  manualCode?: string;
  /** Whether the client uploaded a photo — only used when method.kind === "photo". */
  photoMediaAssetId?: string | null;
};

export type VerifyContext = {
  /** Spot's declared coords (validated lat/lng on save). */
  spotLat: number;
  spotLng: number;
  /**
   * Spot id used to namespace all KV operations. Prefer this over
   * the alias because IDs never change.
   */
  spotId: string;
  /**
   * Side-effecting verifiers (KV-bound). Both consume the relevant
   * KV key — a successful one-time token is single-use.
   */
  consumeOneTimeToken: (spotId: string, jti: string) => Promise<boolean>;
  getActiveManualCode: (spotId: string) => Promise<string | null>;
};

export type VerifyResult = {
  verifiedVia: VerifiedKind[];
  /** Distance from the spot in meters when GPS was attempted, else null. */
  distanceM: number | null;
};

/**
 * Per-method dispatch. Each branch returns either the kind that
 * passed, or throws `OfflineVerificationFailed` with a reason.
 */
async function verifyOne(
  method: OfflineCheckInVerificationMethod,
  input: VerifyInput,
  ctx: VerifyContext,
  state: { distanceM: number | null },
): Promise<VerifiedKind> {
  switch (method.kind) {
    case "gps": {
      if (
        input.lat === undefined ||
        input.lng === undefined ||
        !isValidLatLng(input.lat, input.lng)
      ) {
        throw new OfflineVerificationFailed("missing or invalid GPS coords");
      }
      const distance = haversineMeters(
        ctx.spotLat,
        ctx.spotLng,
        input.lat,
        input.lng,
      );
      state.distanceM = distance;
      // Apply accuracy slack — if the device says ±50m and the spot
      // radius is 30m, we add the accuracy to the budget so a borderline
      // standing-near-the-edge user doesn't get rejected because their
      // GPS happened to settle 5m outside.
      const slack = Math.min(input.accuracyM ?? 0, method.radiusM); // cap slack at radius
      if (distance > method.radiusM + slack) {
        throw new OfflineVerificationFailed(
          `GPS too far: ${Math.round(distance)}m > ${method.radiusM}m`,
        );
      }
      return "gps";
    }
    case "qr": {
      if (!input.qrToken) {
        throw new OfflineVerificationFailed("missing qrToken");
      }
      if (method.mode === "static") {
        // Static QR carries no anti-replay — we accept any non-empty
        // token. Tenants combine this with manual_code or photo for
        // higher-stakes points.
        return "qr";
      }
      // one-time
      const ok = await ctx.consumeOneTimeToken(ctx.spotId, input.qrToken);
      if (!ok) {
        throw new OfflineVerificationFailed(
          "QR token already consumed or expired",
        );
      }
      return "qr";
    }
    case "manual_code": {
      if (!input.manualCode) {
        throw new OfflineVerificationFailed("missing manualCode");
      }
      const expected = await ctx.getActiveManualCode(ctx.spotId);
      if (!expected || expected !== input.manualCode) {
        throw new OfflineVerificationFailed("manual code is invalid or expired");
      }
      return "manual_code";
    }
    case "photo": {
      if (method.required && !input.photoMediaAssetId) {
        throw new OfflineVerificationFailed("photo is required for this spot");
      }
      // Without `required: true`, the photo verifier is a no-op pass —
      // we accept the upload as evidence but don't gate on it.
      return "photo";
    }
  }
}

/**
 * Run the spot's verification methods against the client's input.
 *
 * - `combinator='any'` → succeeds on the first method that passes;
 *   collects all passers but doesn't require all to pass.
 * - `combinator='all'` → must succeed for every declared method, in
 *   declaration order. Fails fast on the first failure.
 *
 * `gps` distance is recorded into the result regardless of success/fail
 * (when the client supplied coords) so the log row gets it.
 */
export async function verify(
  config: OfflineCheckInVerification,
  input: VerifyInput,
  ctx: VerifyContext,
): Promise<VerifyResult> {
  const passed: VerifiedKind[] = [];
  const state: { distanceM: number | null } = { distanceM: null };

  if (config.combinator === "all") {
    for (const m of config.methods) {
      const kind = await verifyOne(m, input, ctx, state);
      passed.push(kind);
    }
  } else {
    // any
    let lastErr: OfflineVerificationFailed | null = null;
    for (const m of config.methods) {
      try {
        const kind = await verifyOne(m, input, ctx, state);
        passed.push(kind);
      } catch (err) {
        if (err instanceof OfflineVerificationFailed) {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    if (passed.length === 0 && lastErr) throw lastErr;
  }

  return { verifiedVia: passed, distanceM: state.distanceM };
}
