/**
 * Client Credentials service — protocol-agnostic business logic.
 *
 * Manages publishable key + secret pairs for C-end API access with HMAC
 * identity verification. Follows the same DI pattern as check-in:
 * - Only imports AppDeps TYPE, never the singleton
 * - No Hono / HTTP imports
 * - Throws ModuleError subclasses for errors
 *
 * The secret (csk_) is AES-256-GCM encrypted using a key derived from
 * the app secret (BETTER_AUTH_SECRET). At verification time, we decrypt
 * the secret and use it to compute HMAC-SHA256(endUserId) for comparison
 * against the client-provided userHash.
 */

import { eq, and } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  encrypt,
  decrypt,
  generateKeyPair,
  verifyHmac,
} from "../../lib/crypto";
import { clientCredentials } from "../../schema/client-credential";

import {
  CredentialNotFound,
  CredentialDisabled,
  CredentialExpired,
  InvalidHmac,
} from "./errors";
import type { VerifyResult } from "./types";

type ClientCredentialDeps = Pick<AppDeps, "db"> & {
  appSecret: string;
};

export function createClientCredentialService(deps: ClientCredentialDeps) {
  const { db, appSecret } = deps;

  return {
    async create(
      orgId: string,
      input: { name: string; expiresAt?: string; metadata?: Record<string, unknown> },
    ) {
      const pair = generateKeyPair();
      const encryptedSecret = await encrypt(pair.secret, appSecret);

      const [row] = await db
        .insert(clientCredentials)
        .values({
          organizationId: orgId,
          name: input.name,
          publishableKey: pair.publishableKey,
          encryptedSecret,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          metadata: input.metadata ?? null,
        })
        .returning();

      return {
        ...row!,
        secret: pair.secret, // returned only on creation
      };
    },

    async list(orgId: string) {
      return db
        .select({
          id: clientCredentials.id,
          organizationId: clientCredentials.organizationId,
          name: clientCredentials.name,
          publishableKey: clientCredentials.publishableKey,
          devMode: clientCredentials.devMode,
          enabled: clientCredentials.enabled,
          expiresAt: clientCredentials.expiresAt,
          metadata: clientCredentials.metadata,
          createdAt: clientCredentials.createdAt,
          updatedAt: clientCredentials.updatedAt,
        })
        .from(clientCredentials)
        .where(eq(clientCredentials.organizationId, orgId));
    },

    async get(orgId: string, id: string) {
      let row;
      try {
        [row] = await db
          .select({
            id: clientCredentials.id,
            organizationId: clientCredentials.organizationId,
            name: clientCredentials.name,
            publishableKey: clientCredentials.publishableKey,
            devMode: clientCredentials.devMode,
            enabled: clientCredentials.enabled,
            expiresAt: clientCredentials.expiresAt,
            metadata: clientCredentials.metadata,
            createdAt: clientCredentials.createdAt,
            updatedAt: clientCredentials.updatedAt,
          })
          .from(clientCredentials)
          .where(
            and(
              eq(clientCredentials.id, id),
              eq(clientCredentials.organizationId, orgId),
            ),
          );
      } catch (err) {
        // id column is uuid — invalid format triggers Postgres 22P02
        if (isInvalidUuid(err)) throw new CredentialNotFound(id);
        throw err;
      }
      if (!row) throw new CredentialNotFound(id);
      return row;
    },

    async revoke(orgId: string, id: string) {
      const [row] = await db
        .update(clientCredentials)
        .set({ enabled: false })
        .where(
          and(
            eq(clientCredentials.id, id),
            eq(clientCredentials.organizationId, orgId),
          ),
        )
        .returning();
      if (!row) throw new CredentialNotFound(id);
      return row;
    },

    async delete(orgId: string, id: string) {
      const [row] = await db
        .delete(clientCredentials)
        .where(
          and(
            eq(clientCredentials.id, id),
            eq(clientCredentials.organizationId, orgId),
          ),
        )
        .returning({ id: clientCredentials.id });
      if (!row) throw new CredentialNotFound(id);
    },

    async rotate(orgId: string, id: string) {
      const pair = generateKeyPair();
      const encryptedSecret = await encrypt(pair.secret, appSecret);

      const [row] = await db
        .update(clientCredentials)
        .set({
          publishableKey: pair.publishableKey,
          encryptedSecret,
        })
        .where(
          and(
            eq(clientCredentials.id, id),
            eq(clientCredentials.organizationId, orgId),
          ),
        )
        .returning();
      if (!row) throw new CredentialNotFound(id);

      return {
        id: row.id,
        publishableKey: pair.publishableKey,
        secret: pair.secret, // returned only on rotation
      };
    },

    async updateDevMode(orgId: string, id: string, devMode: boolean) {
      const [row] = await db
        .update(clientCredentials)
        .set({ devMode })
        .where(
          and(
            eq(clientCredentials.id, id),
            eq(clientCredentials.organizationId, orgId),
          ),
        )
        .returning();
      if (!row) throw new CredentialNotFound(id);
      return row;
    },

    /**
     * Verify a client request by checking the publishable key, then
     * decrypting the secret and comparing the HMAC.
     *
     * Returns the org ID and credential metadata on success, or throws
     * on any failure (disabled, expired, bad HMAC).
     */
    async verifyRequest(
      publishableKey: string,
      endUserId: string,
      userHash: string | undefined,
    ): Promise<VerifyResult> {
      const [cred] = await db
        .select()
        .from(clientCredentials)
        .where(eq(clientCredentials.publishableKey, publishableKey));

      if (!cred) throw new CredentialNotFound(publishableKey);
      if (!cred.enabled) throw new CredentialDisabled(publishableKey);
      if (cred.expiresAt && cred.expiresAt < new Date()) {
        throw new CredentialExpired(publishableKey);
      }

      // In dev mode, skip HMAC verification
      if (cred.devMode) {
        return {
          valid: true,
          organizationId: cred.organizationId,
          credentialId: cred.id,
          devMode: true,
        };
      }

      // HMAC verification required
      if (!userHash) {
        throw new InvalidHmac();
      }

      const secret = await decrypt(cred.encryptedSecret, appSecret);
      const valid = await verifyHmac(endUserId, secret, userHash);
      if (!valid) {
        throw new InvalidHmac();
      }

      return {
        valid: true,
        organizationId: cred.organizationId,
        credentialId: cred.id,
        devMode: false,
      };
    },

  };

}

export type ClientCredentialService = ReturnType<
  typeof createClientCredentialService
>;

function isInvalidUuid(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { cause?: { code?: unknown } };
  if (e.cause && typeof e.cause === "object" && e.cause.code === "22P02")
    return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("22P02");
}
