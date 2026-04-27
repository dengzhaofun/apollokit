/**
 * Guild service — protocol-agnostic business logic.
 *
 * This file MUST NOT import Hono, @hono/zod-openapi, or any HTTP concepts.
 * Its only bridge to the outside world is the typed `AppDeps` object.
 *
 * ---------------------------------------------------------------------
 * Concurrency model — single atomic statements, no transactions
 * ---------------------------------------------------------------------
 *
 * `drizzle-orm/neon-http` rejects `db.transaction()`. All writes are
 * expressed as single atomic SQL statements. Member count updates use a
 * version-guarded pattern:
 *
 *   UPDATE guild_guilds
 *   SET member_count = member_count + 1, version = version + 1
 *   WHERE id = ? AND version = ? AND member_count < max_members
 *   RETURNING *
 *
 * If zero rows come back, another request mutated the guild between our
 * read and our write — we throw GuildConcurrencyConflict (or
 * GuildMemberLimitReached if the cap was hit).
 *
 * One-guild-per-user-per-org is enforced in the service layer by checking
 * guild_members joined to guild_guilds.isActive before adding a member.
 */

import { and, count, desc, eq, ilike, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import {
  guildContributionLogs,
  guildGuilds,
  guildJoinRequests,
  guildMembers,
  guildSettings,
} from "../../schema/guild";
import {
  GuildAlreadyInGuild,
  GuildAlreadyMember,
  GuildConcurrencyConflict,
  GuildInactive,
  GuildInsufficientPermission,
  GuildJoinRequestNotFound,
  GuildMemberLimitReached,
  GuildNotFound,
  GuildNotMember,
  GuildOfficerLimitReached,
  GuildSettingsNotFound,
} from "./errors";
import type {
  Guild,
  GuildContributionLog,
  GuildJoinRequest,
  GuildMember,
  GuildRole,
  GuildSettings,
} from "./types";
import type { CreateGuildInput, UpdateGuildInput, UpsertSettingsInput } from "./validators";

// `events` optional so `createGuildService({ db })` test sites keep
// compiling. Production wiring hands it in via `deps`.
type GuildDeps = Pick<AppDeps, "db"> & Partial<Pick<AppDeps, "events">>;

// Extend the in-runtime event-bus type map with guild-domain events.
declare module "../../lib/event-bus" {
  interface EventMap {
    "guild.created": {
      organizationId: string;
      endUserId: string;
      guildId: string;
      guildName: string;
      joinMode: string;
    };
    "guild.joined": {
      organizationId: string;
      endUserId: string;
      guildId: string;
      // "open" (applyToJoin auto-admits) or "request" (acceptJoinRequest path).
      via: "open" | "request";
      approverUserId: string | null;
    };
    "guild.left": {
      organizationId: string;
      endUserId: string;
      guildId: string;
    };
    "guild.contributed": {
      organizationId: string;
      endUserId: string;
      guildId: string;
      delta: number;
      guildExpDelta: number;
      source: string;
    };
  }
}

export function createGuildService(d: GuildDeps) {
  const { db, events } = d;

  // ─── Internal helpers ──────────────────────────────────────────

  async function loadGuild(orgId: string, guildId: string): Promise<Guild> {
    const rows = await db
      .select()
      .from(guildGuilds)
      .where(
        and(
          eq(guildGuilds.id, guildId),
          eq(guildGuilds.organizationId, orgId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new GuildNotFound(guildId);
    return row;
  }

  async function loadActiveGuild(orgId: string, guildId: string): Promise<Guild> {
    const guild = await loadGuild(orgId, guildId);
    if (!guild.isActive) throw new GuildInactive(guildId);
    return guild;
  }

  async function loadMember(guildId: string, endUserId: string): Promise<GuildMember> {
    const rows = await db
      .select()
      .from(guildMembers)
      .where(
        and(
          eq(guildMembers.guildId, guildId),
          eq(guildMembers.endUserId, endUserId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new GuildNotMember(endUserId);
    return row;
  }

  /**
   * Check if a user is already in an active guild in this org.
   * Returns the membership row if found, null otherwise.
   */
  async function findActiveGuildMembership(
    orgId: string,
    endUserId: string,
  ): Promise<GuildMember | null> {
    const rows = await db
      .select({ guildMembers })
      .from(guildMembers)
      .innerJoin(guildGuilds, eq(guildMembers.guildId, guildGuilds.id))
      .where(
        and(
          eq(guildMembers.organizationId, orgId),
          eq(guildMembers.endUserId, endUserId),
          eq(guildGuilds.isActive, true),
        ),
      )
      .limit(1);
    return rows[0]?.guildMembers ?? null;
  }

  /** Require the user is NOT already in a guild in this org. */
  async function ensureNotInGuild(orgId: string, endUserId: string): Promise<void> {
    const existing = await findActiveGuildMembership(orgId, endUserId);
    if (existing) throw new GuildAlreadyInGuild(endUserId);
  }

  /** Require role is at least officer (leader or officer). */
  function requireOfficerOrAbove(role: string, action: string): void {
    if (role !== "leader" && role !== "officer") {
      throw new GuildInsufficientPermission(action);
    }
  }

  /** Require role is leader. */
  function requireLeader(role: string, action: string): void {
    if (role !== "leader") {
      throw new GuildInsufficientPermission(action);
    }
  }

  /**
   * Atomically increment member_count with version guard.
   * Returns the updated guild or throws on conflict / limit reached.
   */
  async function incrementMemberCount(guild: Guild): Promise<Guild> {
    const updated = await db
      .update(guildGuilds)
      .set({
        memberCount: sql`${guildGuilds.memberCount} + 1`,
        version: sql`${guildGuilds.version} + 1`,
      })
      .where(
        and(
          eq(guildGuilds.id, guild.id),
          eq(guildGuilds.version, guild.version),
          sql`${guildGuilds.memberCount} < ${guildGuilds.maxMembers}`,
        ),
      )
      .returning();

    if (updated.length === 0) {
      // Re-read to distinguish limit vs concurrency
      const fresh = await loadGuild(guild.organizationId, guild.id);
      if (fresh.memberCount >= fresh.maxMembers) {
        throw new GuildMemberLimitReached(guild.id);
      }
      throw new GuildConcurrencyConflict();
    }
    return updated[0]!;
  }

  /**
   * Atomically decrement member_count with version guard.
   */
  async function decrementMemberCount(guild: Guild): Promise<Guild> {
    const updated = await db
      .update(guildGuilds)
      .set({
        memberCount: sql`${guildGuilds.memberCount} - 1`,
        version: sql`${guildGuilds.version} + 1`,
      })
      .where(
        and(
          eq(guildGuilds.id, guild.id),
          eq(guildGuilds.version, guild.version),
          sql`${guildGuilds.memberCount} > 0`,
        ),
      )
      .returning();

    if (updated.length === 0) {
      throw new GuildConcurrencyConflict();
    }
    return updated[0]!;
  }

  /**
   * Add a member to a guild. Caller is responsible for:
   * - Checking one-guild-per-user (ensureNotInGuild)
   * - Incrementing member count (incrementMemberCount)
   */
  async function insertMember(
    orgId: string,
    guildId: string,
    endUserId: string,
    role: GuildRole,
  ): Promise<GuildMember> {
    const [row] = await db
      .insert(guildMembers)
      .values({
        guildId,
        endUserId,
        organizationId: orgId,
        role,
      })
      .returning();
    if (!row) throw new Error("insert member returned no row");
    return row;
  }

  /**
   * Check officer count for a guild against the org settings limit.
   */
  async function checkOfficerLimit(orgId: string, guildId: string): Promise<void> {
    const settings = await getSettingsOrDefaults(orgId);
    const [result] = await db
      .select({ count: count() })
      .from(guildMembers)
      .where(
        and(
          eq(guildMembers.guildId, guildId),
          eq(guildMembers.role, "officer"),
        ),
      );
    if (result && result.count >= settings.maxOfficers) {
      throw new GuildOfficerLimitReached(guildId);
    }
  }

  /**
   * Get settings or return sensible defaults if none exist.
   */
  async function getSettingsOrDefaults(orgId: string): Promise<{ maxMembers: number; maxOfficers: number; levelUpRules: { level: number; expRequired: number; memberCapBonus: number }[] | null }> {
    const rows = await db
      .select()
      .from(guildSettings)
      .where(eq(guildSettings.organizationId, orgId))
      .limit(1);
    const row = rows[0];
    return {
      maxMembers: row?.maxMembers ?? 50,
      maxOfficers: row?.maxOfficers ?? 5,
      levelUpRules: (row?.levelUpRules ?? null) as { level: number; expRequired: number; memberCapBonus: number }[] | null,
    };
  }

  /**
   * Check if guild should level up based on levelUpRules, and apply if so.
   * This is an atomic version-guarded update.
   */
  async function maybeApplyLevelUp(guild: Guild, orgId: string): Promise<void> {
    const settings = await getSettingsOrDefaults(orgId);
    const rules = settings.levelUpRules;
    if (!rules || rules.length === 0) return;

    // Re-read the guild to get the latest experience
    const fresh = await loadGuild(orgId, guild.id);

    // Find the highest level the guild qualifies for
    const sortedRules = [...rules].sort((a, b) => b.level - a.level);
    for (const rule of sortedRules) {
      if (fresh.experience >= rule.expRequired && fresh.level < rule.level) {
        // Level up!
        await db
          .update(guildGuilds)
          .set({
            level: rule.level,
            maxMembers: sql`${guildGuilds.maxMembers} + ${rule.memberCapBonus}`,
            version: sql`${guildGuilds.version} + 1`,
          })
          .where(
            and(
              eq(guildGuilds.id, fresh.id),
              eq(guildGuilds.version, fresh.version),
            ),
          );
        // Only one level-up per action; further level-ups happen on next contribution
        break;
      }
    }
  }

  // ─── Public API ────────────────────────────────────────────────

  return {
    // ── Settings ─────────────────────────────────────────────────

    async getSettings(orgId: string): Promise<GuildSettings> {
      const rows = await db
        .select()
        .from(guildSettings)
        .where(eq(guildSettings.organizationId, orgId))
        .limit(1);
      const row = rows[0];
      if (!row) throw new GuildSettingsNotFound(orgId);
      return row;
    },

    async upsertSettings(orgId: string, input: UpsertSettingsInput): Promise<GuildSettings> {
      const [row] = await db
        .insert(guildSettings)
        .values({
          organizationId: orgId,
          maxMembers: input.maxMembers ?? 50,
          maxOfficers: input.maxOfficers ?? 5,
          createCost: input.createCost ?? [],
          levelUpRules: input.levelUpRules ?? null,
          joinMode: input.joinMode ?? "request",
          metadata: input.metadata ?? null,
        })
        .onConflictDoUpdate({
          target: [guildSettings.organizationId],
          set: {
            ...(input.maxMembers !== undefined ? { maxMembers: input.maxMembers } : {}),
            ...(input.maxOfficers !== undefined ? { maxOfficers: input.maxOfficers } : {}),
            ...(input.createCost !== undefined ? { createCost: input.createCost } : {}),
            ...(input.levelUpRules !== undefined ? { levelUpRules: input.levelUpRules } : {}),
            ...(input.joinMode !== undefined ? { joinMode: input.joinMode } : {}),
            ...(input.metadata !== undefined ? { metadata: input.metadata ?? null } : {}),
          },
        })
        .returning();
      if (!row) throw new Error("upsert settings returned no row");
      return row;
    },

    // ── Guild CRUD ───────────────────────────────────────────────

    async createGuild(
      orgId: string,
      endUserId: string,
      input: CreateGuildInput,
    ): Promise<{ guild: Guild; member: GuildMember }> {
      // One-guild-per-user-per-org
      await ensureNotInGuild(orgId, endUserId);

      const settings = await getSettingsOrDefaults(orgId);

      const [guild] = await db
        .insert(guildGuilds)
        .values({
          organizationId: orgId,
          name: input.name,
          description: input.description ?? null,
          icon: input.icon ?? null,
          leaderUserId: endUserId,
          maxMembers: settings.maxMembers,
          joinMode: input.joinMode ?? "request",
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!guild) throw new Error("insert guild returned no row");

      // Insert creator as leader
      const member = await insertMember(orgId, guild.id, endUserId, "leader");

      if (events) {
        await events.emit("guild.created", {
          organizationId: orgId,
          endUserId,
          guildId: guild.id,
          guildName: guild.name,
          joinMode: guild.joinMode,
        });
        // A newly created guild has its creator implicitly joined as leader.
        await events.emit("guild.joined", {
          organizationId: orgId,
          endUserId,
          guildId: guild.id,
          via: "open",
          approverUserId: null,
        });
      }

      return { guild, member };
    },

    async getGuild(orgId: string, guildId: string): Promise<Guild> {
      return loadGuild(orgId, guildId);
    },

    async listGuilds(
      orgId: string,
      opts: PageParams & { search?: string } = {},
    ): Promise<Page<Guild>> {
      const limit = clampLimit(opts.limit);
      // `search` is the legacy alias; `q` is the new standard. Honor both.
      const searchTerm = opts.q ?? opts.search;
      const conditions: SQL[] = [
        eq(guildGuilds.organizationId, orgId),
        eq(guildGuilds.isActive, true),
      ];
      if (searchTerm) {
        conditions.push(ilike(guildGuilds.name, `%${searchTerm}%`));
      }
      const seek = cursorWhere(opts.cursor, guildGuilds.createdAt, guildGuilds.id);
      if (seek) conditions.push(seek);
      const rows = await db
        .select()
        .from(guildGuilds)
        .where(and(...conditions))
        .orderBy(desc(guildGuilds.createdAt), desc(guildGuilds.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async updateGuild(
      orgId: string,
      guildId: string,
      input: UpdateGuildInput,
    ): Promise<Guild> {
      const existing = await loadActiveGuild(orgId, guildId);

      const updateValues: Partial<typeof guildGuilds.$inferInsert> = {};
      if (input.name !== undefined) updateValues.name = input.name;
      if (input.description !== undefined) updateValues.description = input.description;
      if (input.icon !== undefined) updateValues.icon = input.icon;
      if (input.announcement !== undefined) updateValues.announcement = input.announcement;
      if (input.joinMode !== undefined) updateValues.joinMode = input.joinMode;
      if (input.metadata !== undefined) updateValues.metadata = input.metadata ?? null;

      if (Object.keys(updateValues).length === 0) return existing;

      const [row] = await db
        .update(guildGuilds)
        .set(updateValues)
        .where(
          and(
            eq(guildGuilds.id, existing.id),
            eq(guildGuilds.organizationId, orgId),
          ),
        )
        .returning();
      if (!row) throw new GuildNotFound(guildId);
      return row;
    },

    async disbandGuild(orgId: string, guildId: string): Promise<Guild> {
      const guild = await loadActiveGuild(orgId, guildId);

      const [row] = await db
        .update(guildGuilds)
        .set({
          isActive: false,
          disbandedAt: new Date(),
          version: sql`${guildGuilds.version} + 1`,
        })
        .where(
          and(
            eq(guildGuilds.id, guild.id),
            eq(guildGuilds.organizationId, orgId),
            eq(guildGuilds.version, guild.version),
          ),
        )
        .returning();
      if (!row) throw new GuildConcurrencyConflict();
      return row;
    },

    async getMyGuild(
      orgId: string,
      endUserId: string,
    ): Promise<{ guild: Guild; member: GuildMember } | null> {
      const rows = await db
        .select({
          guild: guildGuilds,
          member: guildMembers,
        })
        .from(guildMembers)
        .innerJoin(guildGuilds, eq(guildMembers.guildId, guildGuilds.id))
        .where(
          and(
            eq(guildMembers.organizationId, orgId),
            eq(guildMembers.endUserId, endUserId),
            eq(guildGuilds.isActive, true),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return { guild: row.guild, member: row.member };
    },

    // ── Join Requests ────────────────────────────────────────────

    async applyToJoin(
      orgId: string,
      guildId: string,
      endUserId: string,
      message?: string | null,
    ): Promise<GuildJoinRequest> {
      const guild = await loadActiveGuild(orgId, guildId);

      // One-guild-per-user-per-org
      await ensureNotInGuild(orgId, endUserId);

      // If open join mode, skip request and add directly
      if (guild.joinMode === "open") {
        // Add member directly
        await incrementMemberCount(guild);
        await insertMember(orgId, guildId, endUserId, "member");

        // Return a synthetic accepted request
        const [req] = await db
          .insert(guildJoinRequests)
          .values({
            organizationId: orgId,
            guildId,
            endUserId,
            type: "application",
            status: "accepted",
            message: message ?? null,
            respondedAt: new Date(),
          })
          .returning();
        if (!req) throw new Error("insert join request returned no row");

        if (events) {
          await events.emit("guild.joined", {
            organizationId: orgId,
            endUserId,
            guildId,
            via: "open",
            approverUserId: null,
          });
        }

        return req;
      }

      if (guild.joinMode === "closed") {
        throw new GuildInsufficientPermission("guild is closed to new applications");
      }

      // "request" mode — create pending application
      try {
        const [req] = await db
          .insert(guildJoinRequests)
          .values({
            organizationId: orgId,
            guildId,
            endUserId,
            type: "application",
            status: "pending",
            message: message ?? null,
          })
          .returning();
        if (!req) throw new Error("insert join request returned no row");
        return req;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new GuildAlreadyMember(endUserId);
        }
        throw err;
      }
    },

    async acceptJoinRequest(
      orgId: string,
      requestId: string,
      approverUserId: string,
    ): Promise<{ request: GuildJoinRequest; member: GuildMember }> {
      // Load the request
      const rows = await db
        .select()
        .from(guildJoinRequests)
        .where(
          and(
            eq(guildJoinRequests.id, requestId),
            eq(guildJoinRequests.organizationId, orgId),
            eq(guildJoinRequests.status, "pending"),
            eq(guildJoinRequests.type, "application"),
          ),
        )
        .limit(1);
      const req = rows[0];
      if (!req) throw new GuildJoinRequestNotFound(requestId);

      // Check approver is officer+
      const approverMember = await loadMember(req.guildId, approverUserId);
      requireOfficerOrAbove(approverMember.role, "accept join request");

      // Load guild
      const guild = await loadActiveGuild(orgId, req.guildId);

      // Ensure applicant not already in a guild
      await ensureNotInGuild(orgId, req.endUserId);

      // Increment member count
      await incrementMemberCount(guild);

      // Add member
      const member = await insertMember(orgId, req.guildId, req.endUserId, "member");

      // Update request status
      const [updatedReq] = await db
        .update(guildJoinRequests)
        .set({
          status: "accepted",
          respondedAt: new Date(),
          version: sql`${guildJoinRequests.version} + 1`,
        })
        .where(
          and(
            eq(guildJoinRequests.id, requestId),
            eq(guildJoinRequests.status, "pending"),
          ),
        )
        .returning();
      if (!updatedReq) throw new GuildJoinRequestNotFound(requestId);

      if (events) {
        await events.emit("guild.joined", {
          organizationId: orgId,
          endUserId: req.endUserId,
          guildId: req.guildId,
          via: "request",
          approverUserId,
        });
      }

      return { request: updatedReq, member };
    },

    async rejectJoinRequest(
      orgId: string,
      requestId: string,
      approverUserId: string,
    ): Promise<GuildJoinRequest> {
      const rows = await db
        .select()
        .from(guildJoinRequests)
        .where(
          and(
            eq(guildJoinRequests.id, requestId),
            eq(guildJoinRequests.organizationId, orgId),
            eq(guildJoinRequests.status, "pending"),
            eq(guildJoinRequests.type, "application"),
          ),
        )
        .limit(1);
      const req = rows[0];
      if (!req) throw new GuildJoinRequestNotFound(requestId);

      // Check approver is officer+
      const approverMember = await loadMember(req.guildId, approverUserId);
      requireOfficerOrAbove(approverMember.role, "reject join request");

      const [updatedReq] = await db
        .update(guildJoinRequests)
        .set({
          status: "rejected",
          respondedAt: new Date(),
          version: sql`${guildJoinRequests.version} + 1`,
        })
        .where(
          and(
            eq(guildJoinRequests.id, requestId),
            eq(guildJoinRequests.status, "pending"),
          ),
        )
        .returning();
      if (!updatedReq) throw new GuildJoinRequestNotFound(requestId);
      return updatedReq;
    },

    async inviteUser(
      orgId: string,
      guildId: string,
      inviterUserId: string,
      targetUserId: string,
    ): Promise<GuildJoinRequest> {
      const guild = await loadActiveGuild(orgId, guildId);

      // Inviter must be officer+
      const inviterMember = await loadMember(guild.id, inviterUserId);
      requireOfficerOrAbove(inviterMember.role, "invite user");

      // Target must not already be in a guild
      await ensureNotInGuild(orgId, targetUserId);

      try {
        const [req] = await db
          .insert(guildJoinRequests)
          .values({
            organizationId: orgId,
            guildId,
            endUserId: targetUserId,
            type: "invitation",
            status: "pending",
            invitedBy: inviterUserId,
          })
          .returning();
        if (!req) throw new Error("insert invitation returned no row");
        return req;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new GuildAlreadyMember(targetUserId);
        }
        throw err;
      }
    },

    async acceptInvitation(
      orgId: string,
      requestId: string,
      endUserId: string,
    ): Promise<{ request: GuildJoinRequest; member: GuildMember }> {
      const rows = await db
        .select()
        .from(guildJoinRequests)
        .where(
          and(
            eq(guildJoinRequests.id, requestId),
            eq(guildJoinRequests.organizationId, orgId),
            eq(guildJoinRequests.status, "pending"),
            eq(guildJoinRequests.type, "invitation"),
            eq(guildJoinRequests.endUserId, endUserId),
          ),
        )
        .limit(1);
      const req = rows[0];
      if (!req) throw new GuildJoinRequestNotFound(requestId);

      // Ensure user not already in a guild
      await ensureNotInGuild(orgId, endUserId);

      const guild = await loadActiveGuild(orgId, req.guildId);

      // Increment member count
      await incrementMemberCount(guild);

      // Add member
      const member = await insertMember(orgId, req.guildId, endUserId, "member");

      // Update request
      const [updatedReq] = await db
        .update(guildJoinRequests)
        .set({
          status: "accepted",
          respondedAt: new Date(),
          version: sql`${guildJoinRequests.version} + 1`,
        })
        .where(
          and(
            eq(guildJoinRequests.id, requestId),
            eq(guildJoinRequests.status, "pending"),
          ),
        )
        .returning();
      if (!updatedReq) throw new GuildJoinRequestNotFound(requestId);

      if (events) {
        // Invitation flow: the invitee is the end-user actor; the inviter
        // may have been an officer+, but we don't surface them as
        // approverUserId here (for invitations, the "approver" is the
        // invitee themselves).
        await events.emit("guild.joined", {
          organizationId: orgId,
          endUserId,
          guildId: req.guildId,
          via: "request",
          approverUserId: null,
        });
      }

      return { request: updatedReq, member };
    },

    async rejectInvitation(
      orgId: string,
      requestId: string,
      endUserId: string,
    ): Promise<GuildJoinRequest> {
      const rows = await db
        .select()
        .from(guildJoinRequests)
        .where(
          and(
            eq(guildJoinRequests.id, requestId),
            eq(guildJoinRequests.organizationId, orgId),
            eq(guildJoinRequests.status, "pending"),
            eq(guildJoinRequests.type, "invitation"),
            eq(guildJoinRequests.endUserId, endUserId),
          ),
        )
        .limit(1);
      const req = rows[0];
      if (!req) throw new GuildJoinRequestNotFound(requestId);

      const [updatedReq] = await db
        .update(guildJoinRequests)
        .set({
          status: "rejected",
          respondedAt: new Date(),
          version: sql`${guildJoinRequests.version} + 1`,
        })
        .where(
          and(
            eq(guildJoinRequests.id, requestId),
            eq(guildJoinRequests.status, "pending"),
          ),
        )
        .returning();
      if (!updatedReq) throw new GuildJoinRequestNotFound(requestId);
      return updatedReq;
    },

    // ── Membership management ────────────────────────────────────

    async leaveGuild(
      orgId: string,
      guildId: string,
      endUserId: string,
    ): Promise<void> {
      const guild = await loadActiveGuild(orgId, guildId);
      const member = await loadMember(guildId, endUserId);

      // Leaders cannot leave — must transfer leadership first
      if (member.role === "leader") {
        throw new GuildInsufficientPermission("leader must transfer leadership before leaving");
      }

      // Remove member
      await db
        .delete(guildMembers)
        .where(
          and(
            eq(guildMembers.guildId, guildId),
            eq(guildMembers.endUserId, endUserId),
          ),
        );

      // Decrement member count
      await decrementMemberCount(guild);

      if (events) {
        await events.emit("guild.left", {
          organizationId: orgId,
          endUserId,
          guildId,
        });
      }
    },

    async kickMember(
      orgId: string,
      guildId: string,
      kickerUserId: string,
      targetUserId: string,
    ): Promise<void> {
      const guild = await loadActiveGuild(orgId, guildId);
      const kicker = await loadMember(guildId, kickerUserId);
      const target = await loadMember(guildId, targetUserId);

      // Cannot kick yourself
      if (kickerUserId === targetUserId) {
        throw new GuildInsufficientPermission("cannot kick yourself");
      }

      // Permission hierarchy: leader > officer > member
      if (kicker.role === "officer" && target.role !== "member") {
        throw new GuildInsufficientPermission("officers can only kick members");
      }
      if (kicker.role === "member") {
        throw new GuildInsufficientPermission("members cannot kick");
      }

      // Remove member
      await db
        .delete(guildMembers)
        .where(
          and(
            eq(guildMembers.guildId, guildId),
            eq(guildMembers.endUserId, targetUserId),
          ),
        );

      // Decrement member count
      await decrementMemberCount(guild);
    },

    async promoteMember(
      orgId: string,
      guildId: string,
      promoterUserId: string,
      targetUserId: string,
    ): Promise<GuildMember> {
      await loadActiveGuild(orgId, guildId);
      const promoter = await loadMember(guildId, promoterUserId);
      requireLeader(promoter.role, "promote member");

      const target = await loadMember(guildId, targetUserId);
      if (target.role !== "member") {
        throw new GuildInsufficientPermission("can only promote members to officer");
      }

      // Check officer limit
      await checkOfficerLimit(orgId, guildId);

      const [row] = await db
        .update(guildMembers)
        .set({ role: "officer" })
        .where(
          and(
            eq(guildMembers.guildId, guildId),
            eq(guildMembers.endUserId, targetUserId),
          ),
        )
        .returning();
      if (!row) throw new GuildNotMember(targetUserId);
      return row;
    },

    async demoteMember(
      orgId: string,
      guildId: string,
      demoterUserId: string,
      targetUserId: string,
    ): Promise<GuildMember> {
      await loadActiveGuild(orgId, guildId);
      const demoter = await loadMember(guildId, demoterUserId);
      requireLeader(demoter.role, "demote member");

      const target = await loadMember(guildId, targetUserId);
      if (target.role !== "officer") {
        throw new GuildInsufficientPermission("can only demote officers to member");
      }

      const [row] = await db
        .update(guildMembers)
        .set({ role: "member" })
        .where(
          and(
            eq(guildMembers.guildId, guildId),
            eq(guildMembers.endUserId, targetUserId),
          ),
        )
        .returning();
      if (!row) throw new GuildNotMember(targetUserId);
      return row;
    },

    async transferLeader(
      orgId: string,
      guildId: string,
      currentLeaderUserId: string,
      newLeaderUserId: string,
    ): Promise<void> {
      const guild = await loadActiveGuild(orgId, guildId);
      const currentLeader = await loadMember(guildId, currentLeaderUserId);
      requireLeader(currentLeader.role, "transfer leadership");

      await loadMember(guildId, newLeaderUserId); // ensure target is a member

      // Demote current leader to officer
      await db
        .update(guildMembers)
        .set({ role: "officer" })
        .where(
          and(
            eq(guildMembers.guildId, guildId),
            eq(guildMembers.endUserId, currentLeaderUserId),
          ),
        );

      // Promote new leader
      await db
        .update(guildMembers)
        .set({ role: "leader" })
        .where(
          and(
            eq(guildMembers.guildId, guildId),
            eq(guildMembers.endUserId, newLeaderUserId),
          ),
        );

      // Update guild.leaderUserId
      await db
        .update(guildGuilds)
        .set({
          leaderUserId: newLeaderUserId,
          version: sql`${guildGuilds.version} + 1`,
        })
        .where(
          and(
            eq(guildGuilds.id, guild.id),
            eq(guildGuilds.organizationId, orgId),
          ),
        );
    },

    // ── Contribution / Experience ────────────────────────────────

    async contribute(
      orgId: string,
      guildId: string,
      endUserId: string,
      delta: number,
      source: string,
      sourceId?: string | null,
    ): Promise<GuildContributionLog> {
      const guild = await loadActiveGuild(orgId, guildId);
      await loadMember(guildId, endUserId); // ensure member

      // Update member contribution
      await db
        .update(guildMembers)
        .set({
          contribution: sql`${guildMembers.contribution} + ${delta}`,
        })
        .where(
          and(
            eq(guildMembers.guildId, guildId),
            eq(guildMembers.endUserId, endUserId),
          ),
        );

      // Update guild experience (contribution also grants guild exp)
      await db
        .update(guildGuilds)
        .set({
          experience: sql`${guildGuilds.experience} + ${delta}`,
          version: sql`${guildGuilds.version} + 1`,
        })
        .where(
          and(
            eq(guildGuilds.id, guildId),
            eq(guildGuilds.organizationId, orgId),
          ),
        );

      // Insert contribution log
      const [log] = await db
        .insert(guildContributionLogs)
        .values({
          organizationId: orgId,
          guildId,
          endUserId,
          delta,
          guildExpDelta: delta,
          source,
          sourceId: sourceId ?? null,
        })
        .returning();
      if (!log) throw new Error("insert contribution log returned no row");

      // Check level up
      await maybeApplyLevelUp(guild, orgId);

      if (events) {
        await events.emit("guild.contributed", {
          organizationId: orgId,
          endUserId,
          guildId,
          delta,
          guildExpDelta: delta,
          source,
        });
      }

      return log;
    },

    async grantExp(
      orgId: string,
      guildId: string,
      amount: number,
      source: string,
      sourceId?: string | null,
    ): Promise<GuildContributionLog> {
      const guild = await loadActiveGuild(orgId, guildId);

      // Update guild experience
      await db
        .update(guildGuilds)
        .set({
          experience: sql`${guildGuilds.experience} + ${amount}`,
          version: sql`${guildGuilds.version} + 1`,
        })
        .where(
          and(
            eq(guildGuilds.id, guildId),
            eq(guildGuilds.organizationId, orgId),
          ),
        );

      // Insert contribution log with a system endUserId
      const [log] = await db
        .insert(guildContributionLogs)
        .values({
          organizationId: orgId,
          guildId,
          endUserId: "__system__",
          delta: 0,
          guildExpDelta: amount,
          source,
          sourceId: sourceId ?? null,
        })
        .returning();
      if (!log) throw new Error("insert contribution log returned no row");

      // Check level up
      await maybeApplyLevelUp(guild, orgId);

      return log;
    },

    // ── List / Query helpers ─────────────────────────────────────

    async listContributions(
      orgId: string,
      guildId: string,
      opts?: { limit?: number; offset?: number },
    ): Promise<GuildContributionLog[]> {
      await loadGuild(orgId, guildId); // ensure guild exists in org
      return db
        .select()
        .from(guildContributionLogs)
        .where(eq(guildContributionLogs.guildId, guildId))
        .orderBy(desc(guildContributionLogs.createdAt))
        .limit(opts?.limit ?? 50)
        .offset(opts?.offset ?? 0);
    },

    async listJoinRequests(
      orgId: string,
      guildId: string,
      opts?: { status?: string; limit?: number; offset?: number },
    ): Promise<GuildJoinRequest[]> {
      await loadGuild(orgId, guildId); // ensure guild exists in org
      const conditions = [eq(guildJoinRequests.guildId, guildId)];
      if (opts?.status) {
        conditions.push(eq(guildJoinRequests.status, opts.status));
      } else {
        conditions.push(eq(guildJoinRequests.status, "pending"));
      }
      return db
        .select()
        .from(guildJoinRequests)
        .where(and(...conditions))
        .orderBy(desc(guildJoinRequests.createdAt))
        .limit(opts?.limit ?? 50)
        .offset(opts?.offset ?? 0);
    },

    async listMembers(
      orgId: string,
      guildId: string,
    ): Promise<GuildMember[]> {
      await loadGuild(orgId, guildId); // ensure guild exists in org
      return db
        .select()
        .from(guildMembers)
        .where(eq(guildMembers.guildId, guildId))
        .orderBy(desc(guildMembers.contribution));
    },
  };
}

export type GuildService = ReturnType<typeof createGuildService>;

