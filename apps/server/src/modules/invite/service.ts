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

    /* ── 邀请码 ───────────────────────────────────────────── */

    /**
     * 返回 endUser 的当前 active 码，首次调用时生成。
     * 并发/码冲突时最多重试 CODE_RETRIES 次。
     */
    async getOrCreateMyCode(orgId: string, endUserId: string) {
      // Fast path: 已有码直接返回
      const existing = await db
        .select({
          code: inviteCodes.code,
          rotatedAt: inviteCodes.rotatedAt,
        })
        .from(inviteCodes)
        .where(
          and(
            eq(inviteCodes.organizationId, orgId),
            eq(inviteCodes.endUserId, endUserId),
          ),
        )
        .limit(1);
      if (existing[0]) {
        return {
          code: formatInviteCode(existing[0].code),
          rotatedAt: existing[0].rotatedAt,
        };
      }

      // Slow path: 生成 + retry
      const settings = await getSettingsOrDefaults(orgId);
      for (let attempt = 0; attempt < CODE_RETRIES; attempt++) {
        const candidate = generateInviteCode(settings.codeLength);
        try {
          const [row] = await db
            .insert(inviteCodes)
            .values({
              organizationId: orgId,
              endUserId,
              code: candidate,
            })
            .onConflictDoNothing()
            .returning();
          if (row) {
            return {
              code: formatInviteCode(row.code),
              rotatedAt: row.rotatedAt,
            };
          }
          // onConflictDoNothing returned 0 rows — can mean:
          //   (a) (org, endUserId) unique violation → 别人刚给 endUserId 插了一条
          //       → 重新走 fast path 读出来
          //   (b) (org, code) unique violation → 码撞了 → retry 下一个 candidate
          // 先重读看是否是 (a)
          const reread = await db
            .select({
              code: inviteCodes.code,
              rotatedAt: inviteCodes.rotatedAt,
            })
            .from(inviteCodes)
            .where(
              and(
                eq(inviteCodes.organizationId, orgId),
                eq(inviteCodes.endUserId, endUserId),
              ),
            )
            .limit(1);
          if (reread[0]) {
            return {
              code: formatInviteCode(reread[0].code),
              rotatedAt: reread[0].rotatedAt,
            };
          }
          // 不是 (a)，肯定是 (b)——继续 retry
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          // 同上：重读或 retry
          const reread = await db
            .select({
              code: inviteCodes.code,
              rotatedAt: inviteCodes.rotatedAt,
            })
            .from(inviteCodes)
            .where(
              and(
                eq(inviteCodes.organizationId, orgId),
                eq(inviteCodes.endUserId, endUserId),
              ),
            )
            .limit(1);
          if (reread[0]) {
            return {
              code: formatInviteCode(reread[0].code),
              rotatedAt: reread[0].rotatedAt,
            };
          }
        }
      }
      throw new InviteCodeConflict();
    },

    /**
     * 轮换 endUser 的码。返回新码 + 设置 rotatedAt = now。
     * endUser 必须已经有码——如果没码，先调 getOrCreateMyCode 再 reset
     * 更符合常识，这里按"没码就先生成再立即 reset"的保守实现。
     */
    async resetCode(orgId: string, endUserId: string) {
      const settings = await getSettingsOrDefaults(orgId);
      for (let attempt = 0; attempt < CODE_RETRIES; attempt++) {
        const candidate = generateInviteCode(settings.codeLength);
        try {
          const [row] = await db
            .insert(inviteCodes)
            .values({
              organizationId: orgId,
              endUserId,
              code: candidate,
              rotatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [inviteCodes.organizationId, inviteCodes.endUserId],
              set: {
                code: candidate,
                rotatedAt: new Date(),
              },
            })
            .returning();
          if (row) {
            return {
              code: formatInviteCode(row.code),
              rotatedAt: row.rotatedAt!,
            };
          }
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          // 码碰撞——retry 下一个 candidate
        }
      }
      throw new InviteCodeConflict();
    },

    /**
     * 根据码查 endUserId。接收归一化或带 "-" 的形式。
     * 码不合法或不存在都返回 null——调用方统一抛 InviteCodeNotFound。
     */
    async lookupByCode(orgId: string, rawCode: string) {
      const normalized = normalizeInviteCode(rawCode);
      if (normalized.length === 0) return null;
      // 基本字符集检查：凡归一化后非字母表字符就直接返回 null
      if (!/^[23456789A-HJ-NP-Z]+$/.test(normalized)) return null;

      const rows = await db
        .select({ endUserId: inviteCodes.endUserId })
        .from(inviteCodes)
        .where(
          and(
            eq(inviteCodes.organizationId, orgId),
            eq(inviteCodes.code, normalized),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },
  };

  // Suppress unused-variable warnings for closure symbols referenced only by later tasks.
  void events;
}

export type InviteService = ReturnType<typeof createInviteService>;

// Suppress unused-imports warnings for symbols referenced only by later tasks.
// They will be used when Tasks 7–9 extend this file.
void count; void desc; void sql;
void inviteRelationships;
void InviteAlreadyBound; void InviteCodeNotFound;
void InviteDisabled; void InviteRelationshipNotFound; void InviteSelfInviteForbidden; void InviteeNotBound;
void ({} as InviteSummary);
