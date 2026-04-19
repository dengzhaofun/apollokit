/**
 * Invite service — protocol-agnostic business logic.
 *
 * - No Hono / @hono/zod-openapi imports.
 * - No direct `../../db` import — receives deps via factory.
 * - Single-statement atomic writes (neon-http 无 transaction).
 *
 * Events published (when `events` dep is supplied):
 *   - invite.bound      — relationship created
 *   - invite.qualified  — relationship first-time qualified
 *
 * Nothing here imports the task module.
 */

import { and, count, desc, eq, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import type { EventBus } from "../../lib/event-bus";
import {
  inviteCodes,
  inviteRelationships,
  inviteSettings,
} from "../../schema/invite";
import {
  formatInviteCode,
  generateInviteCode,
  normalizeInviteCode,
} from "./code";
import {
  InviteAlreadyBound,
  InviteCodeConflict,
  InviteCodeNotFound,
  InviteDisabled,
  InviteRelationshipNotFound,
  InviteSelfInviteForbidden,
  InviteeNotBound,
} from "./errors";
import type {
  InviteSummary,
  ResolvedInviteSettings,
} from "./types";
import type { UpsertInviteSettingsInput } from "./validators";

// Extend event-bus type map for invite-domain events.
declare module "../../lib/event-bus" {
  interface EventMap {
    "invite.bound": {
      organizationId: string;
      endUserId: string;
      inviterEndUserId: string;
      inviteeEndUserId: string;
      code: string;
      boundAt: Date;
    };
    "invite.qualified": {
      organizationId: string;
      endUserId: string;
      inviterEndUserId: string;
      inviteeEndUserId: string;
      qualifiedReason: string | null;
      qualifiedAt: Date;
      boundAt: Date;
    };
  }
}

type InviteDeps = Pick<AppDeps, "db"> & { events?: EventBus };

const DEFAULT_SETTINGS: ResolvedInviteSettings = {
  enabled: true,
  codeLength: 8,
  allowSelfInvite: false,
};

const CODE_RETRIES = 3;

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505") return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("23505");
}

export function createInviteService(d: InviteDeps) {
  const { db, events } = d;

  async function getSettingsOrDefaults(orgId: string): Promise<ResolvedInviteSettings> {
    const rows = await db
      .select()
      .from(inviteSettings)
      .where(eq(inviteSettings.organizationId, orgId))
      .limit(1);
    const row = rows[0];
    if (!row) return DEFAULT_SETTINGS;
    return {
      enabled: row.enabled,
      codeLength: row.codeLength,
      allowSelfInvite: row.allowSelfInvite,
    };
  }

  return {
    /* ── Settings ─────────────────────────────────────────── */
    async getSettings(orgId: string) {
      const rows = await db
        .select()
        .from(inviteSettings)
        .where(eq(inviteSettings.organizationId, orgId))
        .limit(1);
      return rows[0] ?? null;
    },

    async upsertSettings(orgId: string, input: UpsertInviteSettingsInput) {
      // Build the insert values from input + defaults for first-insert.
      const insertValues = {
        organizationId: orgId,
        enabled: input.enabled ?? true,
        codeLength: input.codeLength ?? 8,
        allowSelfInvite: input.allowSelfInvite ?? false,
        metadata: (input.metadata ?? null) as Record<string, unknown> | null,
      };

      // On conflict, only update fields the caller explicitly set (keeps
      // existing row's other fields intact when the caller sends a partial
      // update). We use COALESCE-via-conditional in an update object.
      const setClause: Record<string, unknown> = {};
      if (input.enabled !== undefined) setClause.enabled = input.enabled;
      if (input.codeLength !== undefined) setClause.codeLength = input.codeLength;
      if (input.allowSelfInvite !== undefined) setClause.allowSelfInvite = input.allowSelfInvite;
      if (input.metadata !== undefined) setClause.metadata = input.metadata;

      if (Object.keys(setClause).length === 0) {
        // Nothing to update on conflict — but we still want to be idempotent
        // and return the row. Do an insert-ignore, then select.
        await db
          .insert(inviteSettings)
          .values(insertValues)
          .onConflictDoNothing();
        const [row] = await db
          .select()
          .from(inviteSettings)
          .where(eq(inviteSettings.organizationId, orgId))
          .limit(1);
        if (!row) throw new Error("upsertSettings: row missing after insert-ignore");
        return row;
      }

      const [row] = await db
        .insert(inviteSettings)
        .values(insertValues)
        .onConflictDoUpdate({
          target: inviteSettings.organizationId,
          set: setClause,
        })
        .returning();
      if (!row) throw new Error("upsertSettings: returning no row");
      return row;
    },
  };

  // Suppress unused-variable warnings for closure symbols referenced only by later tasks.
  void events; void getSettingsOrDefaults; void isUniqueViolation;
}

export type InviteService = ReturnType<typeof createInviteService>;

// Suppress unused-imports warnings for symbols referenced only by later tasks.
// They will be used when Tasks 6–9 extend this file.
void and; void count; void desc; void sql;
void inviteCodes; void inviteRelationships;
void formatInviteCode; void generateInviteCode; void normalizeInviteCode;
void InviteAlreadyBound; void InviteCodeConflict; void InviteCodeNotFound;
void InviteDisabled; void InviteRelationshipNotFound; void InviteSelfInviteForbidden; void InviteeNotBound;
void formatInviteCode;
void ({} as InviteSummary);
