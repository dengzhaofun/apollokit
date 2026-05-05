/**
 * Verify the preview JWT signed by the admin server worker.
 *
 * This is a structural mirror of
 * `apps/server/src/modules/page/preview-token.ts`. We can't import that
 * file from here (apps→apps imports are forbidden in the monorepo) and
 * we don't have a `@repo/page-shared` package yet — keeping the verifier
 * code in two places is the smallest workable approximation. Both sides
 * use HS256 with the same secret, fed through `hono/jwt`.
 *
 * If the surface grows (more shared crypto helpers), promote this file
 * + the server's signer to a `@repo/page-shared` package; the work is
 * additive and the call sites don't change.
 */

import { verify } from "hono/jwt";

export interface PreviewTokenPayload {
  projectId: string;
  versionId: string;
  iat: number;
  exp: number;
}

export class PreviewTokenInvalid extends Error {
  constructor(public readonly reason: string) {
    super(`preview token invalid: ${reason}`);
    this.name = "PreviewTokenInvalid";
  }
}

export async function verifyPreviewToken(
  signingKey: string,
  token: string,
  expectedProjectId: string,
): Promise<PreviewTokenPayload> {
  let decoded: unknown;
  try {
    decoded = await verify(token, signingKey, "HS256");
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "signature or expiry check failed";
    throw new PreviewTokenInvalid(reason);
  }

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as Record<string, unknown>).projectId !== "string" ||
    typeof (decoded as Record<string, unknown>).versionId !== "string"
  ) {
    throw new PreviewTokenInvalid("malformed payload");
  }

  const payload = decoded as PreviewTokenPayload;
  if (payload.projectId !== expectedProjectId) {
    throw new PreviewTokenInvalid(
      "token projectId does not match URL projectId",
    );
  }
  return payload;
}
