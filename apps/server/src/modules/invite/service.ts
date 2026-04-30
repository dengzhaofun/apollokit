/**
 * Invite service — protocol-agnostic business logic.
 *
 * - No Hono / @hono/zod-openapi imports.
 * - No direct `../../db` import — receives deps via factory.
 * - Single-statement atomic writes (avoid pinning Hyperdrive pool inside
 *   `db.transaction()` on hot paths).
 *
 * Events published (when `events` dep is supplied):
 *   - invite.bound      — relationship created
 *   - invite.qualified  — relationship first-time qualified
 *
 * Nothing here imports the task module.
 */

import { and, count, desc, eq, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import type { EventBus } from "../../lib/event-bus";
import { getTraceId } from "../../lib/request-context";
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

type InviteDeps = Pick<AppDeps, "db"> & {
  events?: EventBus;
} & Partial<Pick<AppDeps, "analytics">>;

const DEFAULT_SETTINGS: ResolvedInviteSettings = {
  enabled: true,
  codeLength: 8,
  allowSelfInvite: false,
};

const CODE_RETRIES = 3;


export function createInviteService(d: InviteDeps) {
  const { db, events, analytics } = d;

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
            // Pure observational: only the first-time creation path
            // lands here. The fast path and the reread branches both
            // correspond to "code already existed", so we don't tag those.
            if (analytics) {
              void analytics.writer.logEvent({
                ts: new Date(),
                orgId,
                endUserId,
                traceId: getTraceId(),
                event: "invite.code_generated",
                source: "invite",
                amount: 1,
                eventData: { rotatedAt: row.rotatedAt },
              });
            }
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

    /* ── bind ─────────────────────────────────────────────── */

    /**
     * 客户方游戏服务器在 B 注册时调用。落关系、发 invite.bound 事件。
     *
     * 幂等规则：
     *   - invitee 已被**同** inviter 绑 → 200, alreadyBound=true, 不发事件
     *   - invitee 已被**不同** inviter 绑 → throw InviteAlreadyBound (409)
     */
    async bind(
      orgId: string,
      input: { code: string; inviteeEndUserId: string },
    ): Promise<{
      relationship: typeof inviteRelationships.$inferSelect;
      alreadyBound: boolean;
    }> {
      const settings = await getSettingsOrDefaults(orgId);
      if (!settings.enabled) throw new InviteDisabled();

      const lookup = await this.lookupByCode(orgId, input.code);
      if (!lookup) throw new InviteCodeNotFound();
      const inviterEndUserId = lookup.endUserId;

      if (
        inviterEndUserId === input.inviteeEndUserId &&
        !settings.allowSelfInvite
      ) {
        throw new InviteSelfInviteForbidden();
      }

      const normalized = normalizeInviteCode(input.code);

      // 原子插入：INSERT ... ON CONFLICT DO NOTHING RETURNING
      const inserted = await db
        .insert(inviteRelationships)
        .values({
          organizationId: orgId,
          inviterEndUserId,
          inviteeEndUserId: input.inviteeEndUserId,
          inviterCodeSnapshot: normalized,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 1) {
        // 新建成功
        const row = inserted[0]!;
        if (events) {
          await events.emit("invite.bound", {
            organizationId: orgId,
            endUserId: inviterEndUserId,
            inviterEndUserId,
            inviteeEndUserId: input.inviteeEndUserId,
            code: formatInviteCode(normalized),
            boundAt: row.boundAt,
          });
        }
        return { relationship: row, alreadyBound: false };
      }

      // 冲突 —— 查已有行
      const [existing] = await db
        .select()
        .from(inviteRelationships)
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviteeEndUserId, input.inviteeEndUserId),
          ),
        )
        .limit(1);
      if (!existing) {
        // 理论上不可能 —— UNIQUE 冲突意味着行存在
        throw new Error(
          "invite.bind: conflict reported but existing row not found",
        );
      }
      if (existing.inviterEndUserId === inviterEndUserId) {
        return { relationship: existing, alreadyBound: true };
      }
      throw new InviteAlreadyBound();
    },

    /* ── qualify ──────────────────────────────────────────── */

    /**
     * 客户方在认定"这个邀请算数了"时调用。推进 qualified_at + 发 invite.qualified。
     *
     * 原子写：UPDATE ... WHERE qualified_at IS NULL。RETURNING 1 行 → 首次；
     * 0 行再 SELECT 一次区分"不存在"和"已 qualified"。
     */
    async qualify(
      orgId: string,
      input: { inviteeEndUserId: string; qualifiedReason?: string | null },
    ): Promise<{
      relationship: typeof inviteRelationships.$inferSelect;
      alreadyQualified: boolean;
    }> {
      const settings = await getSettingsOrDefaults(orgId);
      if (!settings.enabled) throw new InviteDisabled();

      const reason = input.qualifiedReason ?? null;
      const now = new Date();
      const updated = await db
        .update(inviteRelationships)
        .set({ qualifiedAt: now, qualifiedReason: reason })
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviteeEndUserId, input.inviteeEndUserId),
            sql`${inviteRelationships.qualifiedAt} IS NULL`,
          ),
        )
        .returning();

      if (updated.length === 1) {
        const row = updated[0]!;
        if (events) {
          await events.emit("invite.qualified", {
            organizationId: orgId,
            endUserId: row.inviterEndUserId,
            inviterEndUserId: row.inviterEndUserId,
            inviteeEndUserId: row.inviteeEndUserId,
            qualifiedReason: row.qualifiedReason,
            qualifiedAt: row.qualifiedAt!,
            boundAt: row.boundAt,
          });
        }
        return { relationship: row, alreadyQualified: false };
      }

      // 0 rows — 区分"不存在"和"已 qualified"
      const [existing] = await db
        .select()
        .from(inviteRelationships)
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviteeEndUserId, input.inviteeEndUserId),
          ),
        )
        .limit(1);
      if (!existing) throw new InviteeNotBound();
      return { relationship: existing, alreadyQualified: true };
    },

    /* ── 查询 ─────────────────────────────────────────────── */

    async getSummary(
      orgId: string,
      endUserId: string,
    ): Promise<InviteSummary> {
      const code = await this.getOrCreateMyCode(orgId, endUserId);

      const [boundResult] = await db
        .select({ value: count() })
        .from(inviteRelationships)
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviterEndUserId, endUserId),
          ),
        );

      const [qualifiedResult] = await db
        .select({ value: count() })
        .from(inviteRelationships)
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviterEndUserId, endUserId),
            sql`${inviteRelationships.qualifiedAt} IS NOT NULL`,
          ),
        );

      const [invitedByRow] = await db
        .select({
          inviterEndUserId: inviteRelationships.inviterEndUserId,
          boundAt: inviteRelationships.boundAt,
          qualifiedAt: inviteRelationships.qualifiedAt,
        })
        .from(inviteRelationships)
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviteeEndUserId, endUserId),
          ),
        )
        .limit(1);

      return {
        myCode: code.code,
        myCodeRotatedAt: code.rotatedAt,
        boundCount: boundResult?.value ?? 0,
        qualifiedCount: qualifiedResult?.value ?? 0,
        invitedBy: invitedByRow ?? null,
      };
    },

    async listMyInvitees(
      orgId: string,
      endUserId: string,
      opts?: { limit?: number; offset?: number },
    ) {
      const limit = opts?.limit ?? 20;
      const offset = opts?.offset ?? 0;

      const items = await db
        .select()
        .from(inviteRelationships)
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviterEndUserId, endUserId),
          ),
        )
        .orderBy(desc(inviteRelationships.boundAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await db
        .select({ value: count() })
        .from(inviteRelationships)
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviterEndUserId, endUserId),
          ),
        );

      return { items, total: totalResult?.value ?? 0 };
    },

    async adminListRelationships(
      orgId: string,
      opts?: {
        limit?: number;
        offset?: number;
        inviterEndUserId?: string;
        qualifiedOnly?: boolean;
      },
    ) {
      const limit = opts?.limit ?? 20;
      const offset = opts?.offset ?? 0;

      const filters = [eq(inviteRelationships.organizationId, orgId)];
      if (opts?.inviterEndUserId) {
        filters.push(
          eq(inviteRelationships.inviterEndUserId, opts.inviterEndUserId),
        );
      }
      if (opts?.qualifiedOnly) {
        filters.push(sql`${inviteRelationships.qualifiedAt} IS NOT NULL`);
      }

      const items = await db
        .select()
        .from(inviteRelationships)
        .where(and(...filters))
        .orderBy(desc(inviteRelationships.boundAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await db
        .select({ value: count() })
        .from(inviteRelationships)
        .where(and(...filters));

      return { items, total: totalResult?.value ?? 0 };
    },

    async adminGetUserStats(
      orgId: string,
      endUserId: string,
    ): Promise<InviteSummary> {
      // 与 client getSummary 同结构。如果将来要暴露更多字段再分叉。
      return this.getSummary(orgId, endUserId);
    },

    async adminResetUserCode(orgId: string, endUserId: string) {
      return this.resetCode(orgId, endUserId);
    },

    async adminRevokeRelationship(orgId: string, relationshipId: string) {
      let deleted: { id: string }[];
      try {
        deleted = await db
          .delete(inviteRelationships)
          .where(
            and(
              eq(inviteRelationships.id, relationshipId),
              eq(inviteRelationships.organizationId, orgId),
            ),
          )
          .returning({ id: inviteRelationships.id });
      } catch (err) {
        // id 列是 uuid —— 格式非法时 Postgres 抛 22P02
        if (isInvalidUuid(err)) throw new InviteRelationshipNotFound(relationshipId);
        throw err;
      }
      if (deleted.length === 0) {
        throw new InviteRelationshipNotFound(relationshipId);
      }
    },
  };
}

function isInvalidUuid(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { cause?: { code?: unknown } };
  if (e.cause && typeof e.cause === "object" && e.cause.code === "22P02") return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("22P02");
}

export type InviteService = ReturnType<typeof createInviteService>;
