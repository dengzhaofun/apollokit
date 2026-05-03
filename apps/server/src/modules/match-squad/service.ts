/**
 * MatchSquad service — protocol-agnostic business logic.
 *
 * This file MUST NOT import Hono, @hono/zod-openapi, or any HTTP concepts.
 * Its only bridge to the outside world is the typed `AppDeps` object.
 *
 * ---------------------------------------------------------------------
 * Concurrency strategy — version-guarded single-statement writes
 * ---------------------------------------------------------------------
 *
 * Hot-path writes use single atomic SQL statements with version guards
 * — wrapping multi-statement updates in `db.transaction()` would pin a
 * Hyperdrive pooled connection for the duration. Pattern:
 *
 *   UPDATE team_teams
 *   SET member_count = member_count + 1, version = version + 1
 *   WHERE id = ? AND version = ? AND member_count < ?
 *   RETURNING *;
 *
 * If RETURNING yields zero rows, either the squad was modified concurrently
 * (version mismatch) or the squad is full (member_count >= maxMembers).
 * We re-read to disambiguate and throw the appropriate error.
 *
 * One-squad-at-a-time per configId is enforced by checking for existing
 * active membership before joining. A narrow race (two concurrent joins
 * for different teams) could theoretically create a double membership,
 * but for ephemeral game teams this is acceptable — a future partial
 * unique index on (configId, endUserId, active) can close the gap if needed.
 */

import { and, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import { looksLikeId } from "../../lib/key-resolver";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import {
  matchSquadConfigs,
  matchSquadInvitations,
  matchSquadMembers,
  matchSquads,
} from "../../schema/match-squad";
import {
  MatchSquadAlreadyDissolved,
  MatchSquadAlreadyMember,
  MatchSquadConcurrencyConflict,
  MatchSquadConfigAliasConflict,
  MatchSquadConfigNotFound,
  MatchSquadFull,
  MatchSquadInvitationNotFound,
  MatchSquadNotFound,
  MatchSquadNotLeader,
  MatchSquadNotMember,
} from "./errors";
import type {
  MatchSquad,
  TeamConfig,
  TeamInvitation,
  TeamMember,
  TeamStatus,
  MatchSquadWithMembers,
} from "./types";
import {
  matchSquadFilters,
  type CreateConfigInput,
  type UpdateConfigInput,
} from "./validators";

type TeamDeps = Pick<AppDeps, "db">;

const ACTIVE_STATUSES: TeamStatus[] = ["open", "closed", "in_game"];

export function createMatchSquadService(d: TeamDeps) {
  const { db } = d;

  async function loadConfigByKey(
    tenantId: string,
    key: string,
  ): Promise<TeamConfig> {
    const where = looksLikeId(key)
      ? and(
          eq(matchSquadConfigs.tenantId, tenantId),
          eq(matchSquadConfigs.id, key),
        )
      : and(
          eq(matchSquadConfigs.tenantId, tenantId),
          eq(matchSquadConfigs.alias, key),
        );

    const rows = await db.select().from(matchSquadConfigs).where(where).limit(1);
    const row = rows[0];
    if (!row) throw new MatchSquadConfigNotFound(key);
    return row;
  }

  /** Check if endUser is already in an active squad for this configId. */
  async function getActiveTeamForUser(
    tenantId: string,
    configId: string,
    endUserId: string,
  ): Promise<MatchSquad | null> {
    const rows = await db
      .select({ squad: matchSquads })
      .from(matchSquadMembers)
      .innerJoin(matchSquads, eq(matchSquadMembers.squadId, matchSquads.id))
      .where(
        and(
          eq(matchSquadMembers.tenantId, tenantId),
          eq(matchSquadMembers.endUserId, endUserId),
          eq(matchSquads.configId, configId),
          inArray(matchSquads.status, ACTIVE_STATUSES),
        ),
      )
      .limit(1);
    return rows[0]?.squad ?? null;
  }

  async function loadTeam(
    tenantId: string,
    squadId: string,
  ): Promise<MatchSquad> {
    const rows = await db
      .select()
      .from(matchSquads)
      .where(
        and(
          eq(matchSquads.id, squadId),
          eq(matchSquads.tenantId, tenantId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new MatchSquadNotFound(squadId);
    return row;
  }

  async function loadMatchSquadMembers(squadId: string): Promise<TeamMember[]> {
    return db
      .select()
      .from(matchSquadMembers)
      .where(eq(matchSquadMembers.squadId, squadId))
      .orderBy(matchSquadMembers.joinedAt);
  }

  function assertNotDissolved(squad: MatchSquad): void {
    if (squad.status === "dissolved") {
      throw new MatchSquadAlreadyDissolved(squad.id);
    }
  }

  function assertLeader(squad: MatchSquad, endUserId: string): void {
    if (squad.leaderUserId !== endUserId) {
      throw new MatchSquadNotLeader(endUserId);
    }
  }

  /**
   * Atomically increment memberCount + bump version, guarded by
   * both version and maxMembers.
   * Returns the updated squad row or null if the guard failed.
   */
  async function atomicJoin(
    squadId: string,
    expectedVersion: number,
    maxMembers: number,
  ): Promise<MatchSquad | null> {
    const rows = await db
      .update(matchSquads)
      .set({
        memberCount: sql`${matchSquads.memberCount} + 1`,
        version: sql`${matchSquads.version} + 1`,
      })
      .where(
        and(
          eq(matchSquads.id, squadId),
          eq(matchSquads.version, expectedVersion),
          sql`${matchSquads.memberCount} < ${maxMembers}`,
        ),
      )
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Atomically decrement memberCount + bump version.
   */
  async function atomicLeave(
    squadId: string,
    expectedVersion: number,
  ): Promise<MatchSquad | null> {
    const rows = await db
      .update(matchSquads)
      .set({
        memberCount: sql`${matchSquads.memberCount} - 1`,
        version: sql`${matchSquads.version} + 1`,
      })
      .where(
        and(
          eq(matchSquads.id, squadId),
          eq(matchSquads.version, expectedVersion),
        ),
      )
      .returning();
    return rows[0] ?? null;
  }

  /** Dissolve a squad: set status + dissolvedAt, bump version. */
  async function atomicDissolve(
    squadId: string,
    expectedVersion: number,
  ): Promise<MatchSquad | null> {
    const rows = await db
      .update(matchSquads)
      .set({
        status: "dissolved",
        dissolvedAt: new Date(),
        version: sql`${matchSquads.version} + 1`,
      })
      .where(
        and(
          eq(matchSquads.id, squadId),
          eq(matchSquads.version, expectedVersion),
          ne(matchSquads.status, "dissolved"),
        ),
      )
      .returning();
    return rows[0] ?? null;
  }

  return {
    // ─── Config CRUD ───────────────────────────────────────────

    async createConfig(
      tenantId: string,
      input: CreateConfigInput,
    ): Promise<TeamConfig> {
      try {
        const [row] = await db
          .insert(matchSquadConfigs)
          .values({
            tenantId,
            name: input.name,
            alias: input.alias ?? null,
            maxMembers: input.maxMembers ?? 4,
            autoDissolveOnLeaderLeave: input.autoDissolveOnLeaderLeave ?? false,
            allowQuickMatch: input.allowQuickMatch ?? true,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && input.alias) {
          throw new MatchSquadConfigAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async getConfig(
      tenantId: string,
      idOrAlias: string,
    ): Promise<TeamConfig> {
      return loadConfigByKey(tenantId, idOrAlias);
    },

    async listConfigs(
      tenantId: string,
      params: PageParams = {},
    ): Promise<Page<TeamConfig>> {
      const limit = clampLimit(params.limit);
      const conds: SQL[] = [eq(matchSquadConfigs.tenantId, tenantId)];
      const seek = cursorWhere(params.cursor, matchSquadConfigs.createdAt, matchSquadConfigs.id);
      if (seek) conds.push(seek);
      if (params.q) {
        const pat = `%${params.q}%`;
        const search = or(ilike(matchSquadConfigs.name, pat), ilike(matchSquadConfigs.alias, pat));
        if (search) conds.push(search);
      }
      const rows = await db
        .select()
        .from(matchSquadConfigs)
        .where(and(...conds))
        .orderBy(desc(matchSquadConfigs.createdAt), desc(matchSquadConfigs.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async updateConfig(
      tenantId: string,
      key: string,
      patch: UpdateConfigInput,
    ): Promise<TeamConfig> {
      const existing = await loadConfigByKey(tenantId, key);

      const updateValues: Partial<typeof matchSquadConfigs.$inferInsert> = {};
      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.alias !== undefined) updateValues.alias = patch.alias;
      if (patch.maxMembers !== undefined) updateValues.maxMembers = patch.maxMembers;
      if (patch.autoDissolveOnLeaderLeave !== undefined)
        updateValues.autoDissolveOnLeaderLeave = patch.autoDissolveOnLeaderLeave;
      if (patch.allowQuickMatch !== undefined)
        updateValues.allowQuickMatch = patch.allowQuickMatch;
      if (patch.metadata !== undefined) updateValues.metadata = patch.metadata;

      if (Object.keys(updateValues).length === 0) return existing;

      try {
        const [row] = await db
          .update(matchSquadConfigs)
          .set(updateValues)
          .where(
            and(
              eq(matchSquadConfigs.id, existing.id),
              eq(matchSquadConfigs.tenantId, tenantId),
            ),
          )
          .returning();
        if (!row) throw new MatchSquadConfigNotFound(key);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new MatchSquadConfigAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deleteConfig(tenantId: string, key: string): Promise<void> {
      const existing = await loadConfigByKey(tenantId, key);
      const deleted = await db
        .delete(matchSquadConfigs)
        .where(
          and(
            eq(matchSquadConfigs.id, existing.id),
            eq(matchSquadConfigs.tenantId, tenantId),
          ),
        )
        .returning({ id: matchSquadConfigs.id });
      if (deleted.length === 0) throw new MatchSquadConfigNotFound(key);
    },

    // ─── MatchSquad lifecycle ────────────────────────────────────────

    async createMatchSquad(
      tenantId: string,
      configKey: string,
      endUserId: string,
      metadata?: Record<string, unknown> | null,
    ): Promise<MatchSquadWithMembers> {
      const config = await loadConfigByKey(tenantId, configKey);

      // Enforce one-squad-at-a-time per configId
      const existing = await getActiveTeamForUser(
        tenantId,
        config.id,
        endUserId,
      );
      if (existing) throw new MatchSquadAlreadyMember(endUserId);

      const [squad] = await db
        .insert(matchSquads)
        .values({
          tenantId,
          configId: config.id,
          leaderUserId: endUserId,
          status: "open",
          memberCount: 1,
          version: 1,
          metadata: metadata ?? null,
        })
        .returning();
      if (!squad) throw new Error("insert returned no row");

      const [member] = await db
        .insert(matchSquadMembers)
        .values({
          squadId: squad.id,
          endUserId,
          tenantId,
          role: "leader",
        })
        .returning();
      if (!member) throw new Error("insert returned no row");

      return { ...squad, members: [member] };
    },

    async getMatchSquad(
      tenantId: string,
      squadId: string,
    ): Promise<MatchSquadWithMembers> {
      const squad = await loadTeam(tenantId, squadId);
      const members = await loadMatchSquadMembers(squadId);
      return { ...squad, members };
    },

    async listMatchSquads(
      tenantId: string,
      opts: PageParams & {
        configKey?: string;
        status?: TeamStatus;
      } = {},
    ): Promise<Page<MatchSquad>> {
      const limit = clampLimit(opts.limit);
      // configKey requires an async lookup (id-or-alias → configId), so
      // it stays out of the DSL and is composed here. status flows
      // through the DSL as a flat enum.
      const configIdCond = opts.configKey
        ? eq(matchSquads.configId, (await loadConfigByKey(tenantId, opts.configKey)).id)
        : undefined;
      const where = and(
        eq(matchSquads.tenantId, tenantId),
        configIdCond,
        matchSquadFilters.where(opts as Record<string, unknown>),
        cursorWhere(opts.cursor, matchSquads.createdAt, matchSquads.id),
      );
      const rows = await db
        .select()
        .from(matchSquads)
        .where(where)
        .orderBy(desc(matchSquads.createdAt), desc(matchSquads.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getMyMatchSquad(
      tenantId: string,
      configKey: string,
      endUserId: string,
    ): Promise<MatchSquadWithMembers | null> {
      const config = await loadConfigByKey(tenantId, configKey);
      const squad = await getActiveTeamForUser(
        tenantId,
        config.id,
        endUserId,
      );
      if (!squad) return null;
      const members = await loadMatchSquadMembers(squad.id);
      return { ...squad, members };
    },

    async joinMatchSquad(
      tenantId: string,
      squadId: string,
      endUserId: string,
    ): Promise<MatchSquadWithMembers> {
      const squad = await loadTeam(tenantId, squadId);
      assertNotDissolved(squad);

      if (squad.status !== "open") {
        throw new MatchSquadFull(squadId);
      }

      // Load config to get maxMembers
      const config = await loadConfigByKey(tenantId, squad.configId);

      // Enforce one-squad-at-a-time
      const existingTeam = await getActiveTeamForUser(
        tenantId,
        config.id,
        endUserId,
      );
      if (existingTeam) throw new MatchSquadAlreadyMember(endUserId);

      // Atomic memberCount increment with version + capacity guard
      const updated = await atomicJoin(squad.id, squad.version, config.maxMembers);
      if (!updated) {
        // Re-read to distinguish full vs. version conflict
        const fresh = await loadTeam(tenantId, squadId);
        if (fresh.memberCount >= config.maxMembers) throw new MatchSquadFull(squadId);
        throw new MatchSquadConcurrencyConflict();
      }

      // Insert member row
      await db
        .insert(matchSquadMembers)
        .values({
          squadId: squad.id,
          endUserId,
          tenantId,
          role: "member",
        })
        .onConflictDoNothing();

      const members = await loadMatchSquadMembers(squad.id);
      return { ...updated, members };
    },

    async leaveMatchSquad(
      tenantId: string,
      squadId: string,
      endUserId: string,
    ): Promise<MatchSquad> {
      const squad = await loadTeam(tenantId, squadId);
      assertNotDissolved(squad);

      // Check membership
      const memberRows = await db
        .select()
        .from(matchSquadMembers)
        .where(
          and(
            eq(matchSquadMembers.squadId, squadId),
            eq(matchSquadMembers.endUserId, endUserId),
          ),
        )
        .limit(1);
      if (!memberRows[0]) throw new MatchSquadNotMember(endUserId);

      const isLeader = squad.leaderUserId === endUserId;

      // Load config for autoDissolve decision
      const config = await loadConfigByKey(tenantId, squad.configId);

      if (isLeader) {
        if (config.autoDissolveOnLeaderLeave || squad.memberCount <= 1) {
          // Dissolve squad
          const dissolved = await atomicDissolve(squad.id, squad.version);
          if (!dissolved) throw new MatchSquadConcurrencyConflict();
          // Remove all members
          await db.delete(matchSquadMembers).where(eq(matchSquadMembers.squadId, squadId));
          return dissolved;
        }

        // Transfer leadership to the oldest member
        const otherMembers = await db
          .select()
          .from(matchSquadMembers)
          .where(
            and(
              eq(matchSquadMembers.squadId, squadId),
              ne(matchSquadMembers.endUserId, endUserId),
            ),
          )
          .orderBy(matchSquadMembers.joinedAt)
          .limit(1);

        const newLeader = otherMembers[0];
        if (!newLeader) {
          // No other members — dissolve
          const dissolved = await atomicDissolve(squad.id, squad.version);
          if (!dissolved) throw new MatchSquadConcurrencyConflict();
          await db.delete(matchSquadMembers).where(eq(matchSquadMembers.squadId, squadId));
          return dissolved;
        }

        // Update leader + decrement count in one shot
        const rows = await db
          .update(matchSquads)
          .set({
            leaderUserId: newLeader.endUserId,
            memberCount: sql`${matchSquads.memberCount} - 1`,
            version: sql`${matchSquads.version} + 1`,
          })
          .where(
            and(
              eq(matchSquads.id, squadId),
              eq(matchSquads.version, squad.version),
            ),
          )
          .returning();
        if (!rows[0]) throw new MatchSquadConcurrencyConflict();

        // Promote the new leader's member role
        await db
          .update(matchSquadMembers)
          .set({ role: "leader" })
          .where(
            and(
              eq(matchSquadMembers.squadId, squadId),
              eq(matchSquadMembers.endUserId, newLeader.endUserId),
            ),
          );

        // Remove leaving member
        await db
          .delete(matchSquadMembers)
          .where(
            and(
              eq(matchSquadMembers.squadId, squadId),
              eq(matchSquadMembers.endUserId, endUserId),
            ),
          );

        return rows[0];
      }

      // Non-leader leaves
      const updated = await atomicLeave(squad.id, squad.version);
      if (!updated) throw new MatchSquadConcurrencyConflict();

      await db
        .delete(matchSquadMembers)
        .where(
          and(
            eq(matchSquadMembers.squadId, squadId),
            eq(matchSquadMembers.endUserId, endUserId),
          ),
        );

      return updated;
    },

    async dissolveMatchSquad(
      tenantId: string,
      squadId: string,
      endUserId: string,
    ): Promise<MatchSquad> {
      const squad = await loadTeam(tenantId, squadId);
      assertNotDissolved(squad);
      assertLeader(squad, endUserId);

      const dissolved = await atomicDissolve(squad.id, squad.version);
      if (!dissolved) throw new MatchSquadConcurrencyConflict();

      // Remove all members
      await db.delete(matchSquadMembers).where(eq(matchSquadMembers.squadId, squadId));
      return dissolved;
    },

    async adminDissolveMatchSquad(
      tenantId: string,
      squadId: string,
    ): Promise<MatchSquad> {
      const squad = await loadTeam(tenantId, squadId);
      assertNotDissolved(squad);

      const dissolved = await atomicDissolve(squad.id, squad.version);
      if (!dissolved) throw new MatchSquadConcurrencyConflict();

      await db.delete(matchSquadMembers).where(eq(matchSquadMembers.squadId, squadId));
      return dissolved;
    },

    async kickMember(
      tenantId: string,
      squadId: string,
      kickerUserId: string,
      targetUserId: string,
    ): Promise<MatchSquad> {
      const squad = await loadTeam(tenantId, squadId);
      assertNotDissolved(squad);
      assertLeader(squad, kickerUserId);

      if (kickerUserId === targetUserId) {
        throw new MatchSquadNotMember(targetUserId);
      }

      // Check target is a member
      const memberRows = await db
        .select()
        .from(matchSquadMembers)
        .where(
          and(
            eq(matchSquadMembers.squadId, squadId),
            eq(matchSquadMembers.endUserId, targetUserId),
          ),
        )
        .limit(1);
      if (!memberRows[0]) throw new MatchSquadNotMember(targetUserId);

      const updated = await atomicLeave(squad.id, squad.version);
      if (!updated) throw new MatchSquadConcurrencyConflict();

      await db
        .delete(matchSquadMembers)
        .where(
          and(
            eq(matchSquadMembers.squadId, squadId),
            eq(matchSquadMembers.endUserId, targetUserId),
          ),
        );

      return updated;
    },

    async transferLeader(
      tenantId: string,
      squadId: string,
      currentLeader: string,
      newLeader: string,
    ): Promise<MatchSquad> {
      const squad = await loadTeam(tenantId, squadId);
      assertNotDissolved(squad);
      assertLeader(squad, currentLeader);

      // Verify new leader is a member
      const memberRows = await db
        .select()
        .from(matchSquadMembers)
        .where(
          and(
            eq(matchSquadMembers.squadId, squadId),
            eq(matchSquadMembers.endUserId, newLeader),
          ),
        )
        .limit(1);
      if (!memberRows[0]) throw new MatchSquadNotMember(newLeader);

      const rows = await db
        .update(matchSquads)
        .set({
          leaderUserId: newLeader,
          version: sql`${matchSquads.version} + 1`,
        })
        .where(
          and(
            eq(matchSquads.id, squadId),
            eq(matchSquads.version, squad.version),
          ),
        )
        .returning();
      if (!rows[0]) throw new MatchSquadConcurrencyConflict();

      // Update roles
      await db
        .update(matchSquadMembers)
        .set({ role: "member" })
        .where(
          and(
            eq(matchSquadMembers.squadId, squadId),
            eq(matchSquadMembers.endUserId, currentLeader),
          ),
        );
      await db
        .update(matchSquadMembers)
        .set({ role: "leader" })
        .where(
          and(
            eq(matchSquadMembers.squadId, squadId),
            eq(matchSquadMembers.endUserId, newLeader),
          ),
        );

      return rows[0];
    },

    async updateMatchSquadStatus(
      tenantId: string,
      squadId: string,
      endUserId: string,
      status: "open" | "closed" | "in_game",
    ): Promise<MatchSquad> {
      const squad = await loadTeam(tenantId, squadId);
      assertNotDissolved(squad);
      assertLeader(squad, endUserId);

      const rows = await db
        .update(matchSquads)
        .set({
          status,
          version: sql`${matchSquads.version} + 1`,
        })
        .where(
          and(
            eq(matchSquads.id, squadId),
            eq(matchSquads.version, squad.version),
          ),
        )
        .returning();
      if (!rows[0]) throw new MatchSquadConcurrencyConflict();
      return rows[0];
    },

    // ─── Invitations ───────────────────────────────────────────

    async inviteUser(
      tenantId: string,
      squadId: string,
      fromUserId: string,
      toUserId: string,
    ): Promise<TeamInvitation> {
      const squad = await loadTeam(tenantId, squadId);
      assertNotDissolved(squad);

      // Verify inviter is a member
      const memberRows = await db
        .select()
        .from(matchSquadMembers)
        .where(
          and(
            eq(matchSquadMembers.squadId, squadId),
            eq(matchSquadMembers.endUserId, fromUserId),
          ),
        )
        .limit(1);
      if (!memberRows[0]) throw new MatchSquadNotMember(fromUserId);

      // Check invitee isn't already in a squad for this config
      const config = await loadConfigByKey(tenantId, squad.configId);
      const existingTeam = await getActiveTeamForUser(
        tenantId,
        config.id,
        toUserId,
      );
      if (existingTeam) throw new MatchSquadAlreadyMember(toUserId);

      const expiresAt = new Date(Date.now() + 60_000); // 60 seconds

      try {
        const [inv] = await db
          .insert(matchSquadInvitations)
          .values({
            tenantId,
            squadId,
            fromUserId,
            toUserId,
            status: "pending",
            expiresAt,
            version: 1,
          })
          .returning();
        if (!inv) throw new Error("insert returned no row");
        return inv;
      } catch (err) {
        // Duplicate pending invitation (partial unique index)
        if (isUniqueViolation(err)) {
          throw new MatchSquadAlreadyMember(toUserId);
        }
        throw err;
      }
    },

    async acceptInvitation(
      tenantId: string,
      invitationId: string,
      endUserId: string,
    ): Promise<MatchSquadWithMembers> {
      // Load invitation
      const invRows = await db
        .select()
        .from(matchSquadInvitations)
        .where(
          and(
            eq(matchSquadInvitations.id, invitationId),
            eq(matchSquadInvitations.tenantId, tenantId),
          ),
        )
        .limit(1);
      const inv = invRows[0];
      if (!inv) throw new MatchSquadInvitationNotFound(invitationId);
      if (inv.toUserId !== endUserId) throw new MatchSquadInvitationNotFound(invitationId);
      if (inv.status !== "pending") throw new MatchSquadInvitationNotFound(invitationId);

      // Check expiry
      if (inv.expiresAt && inv.expiresAt < new Date()) {
        // Mark expired
        await db
          .update(matchSquadInvitations)
          .set({ status: "expired", version: sql`${matchSquadInvitations.version} + 1` })
          .where(
            and(
              eq(matchSquadInvitations.id, invitationId),
              eq(matchSquadInvitations.version, inv.version),
            ),
          );
        throw new MatchSquadInvitationNotFound(invitationId);
      }

      // Mark accepted
      const updatedInv = await db
        .update(matchSquadInvitations)
        .set({ status: "accepted", version: sql`${matchSquadInvitations.version} + 1` })
        .where(
          and(
            eq(matchSquadInvitations.id, invitationId),
            eq(matchSquadInvitations.version, inv.version),
          ),
        )
        .returning();
      if (!updatedInv[0]) throw new MatchSquadConcurrencyConflict();

      // Load squad
      const squad = await loadTeam(tenantId, inv.squadId);
      assertNotDissolved(squad);

      const config = await loadConfigByKey(tenantId, squad.configId);

      // Enforce one-squad-at-a-time
      const existingTeam = await getActiveTeamForUser(
        tenantId,
        config.id,
        endUserId,
      );
      if (existingTeam) throw new MatchSquadAlreadyMember(endUserId);

      // Atomic join
      const updated = await atomicJoin(squad.id, squad.version, config.maxMembers);
      if (!updated) {
        const fresh = await loadTeam(tenantId, inv.squadId);
        if (fresh.memberCount >= config.maxMembers) throw new MatchSquadFull(inv.squadId);
        throw new MatchSquadConcurrencyConflict();
      }

      await db
        .insert(matchSquadMembers)
        .values({
          squadId: squad.id,
          endUserId,
          tenantId,
          role: "member",
        })
        .onConflictDoNothing();

      const members = await loadMatchSquadMembers(squad.id);
      return { ...updated, members };
    },

    async rejectInvitation(
      tenantId: string,
      invitationId: string,
      endUserId: string,
    ): Promise<TeamInvitation> {
      const invRows = await db
        .select()
        .from(matchSquadInvitations)
        .where(
          and(
            eq(matchSquadInvitations.id, invitationId),
            eq(matchSquadInvitations.tenantId, tenantId),
          ),
        )
        .limit(1);
      const inv = invRows[0];
      if (!inv) throw new MatchSquadInvitationNotFound(invitationId);
      if (inv.toUserId !== endUserId) throw new MatchSquadInvitationNotFound(invitationId);
      if (inv.status !== "pending") throw new MatchSquadInvitationNotFound(invitationId);

      const rows = await db
        .update(matchSquadInvitations)
        .set({ status: "rejected", version: sql`${matchSquadInvitations.version} + 1` })
        .where(
          and(
            eq(matchSquadInvitations.id, invitationId),
            eq(matchSquadInvitations.version, inv.version),
          ),
        )
        .returning();
      if (!rows[0]) throw new MatchSquadConcurrencyConflict();
      return rows[0];
    },

    // ─── Quick match ───────────────────────────────────────────

    async quickMatch(
      tenantId: string,
      configKey: string,
      endUserId: string,
    ): Promise<MatchSquadWithMembers> {
      const config = await loadConfigByKey(tenantId, configKey);

      if (!config.allowQuickMatch) {
        throw new MatchSquadConfigNotFound(configKey);
      }

      // Check if already in a squad
      const existingTeam = await getActiveTeamForUser(
        tenantId,
        config.id,
        endUserId,
      );
      if (existingTeam) {
        const members = await loadMatchSquadMembers(existingTeam.id);
        return { ...existingTeam, members };
      }

      // Find the fullest open squad with space
      const candidates = await db
        .select()
        .from(matchSquads)
        .where(
          and(
            eq(matchSquads.tenantId, tenantId),
            eq(matchSquads.configId, config.id),
            eq(matchSquads.status, "open"),
            sql`${matchSquads.memberCount} < ${config.maxMembers}`,
          ),
        )
        .orderBy(desc(matchSquads.memberCount))
        .limit(5); // Try a few candidates in case of race conditions

      for (const candidate of candidates) {
        // Attempt atomic join
        const updated = await atomicJoin(
          candidate.id,
          candidate.version,
          config.maxMembers,
        );
        if (updated) {
          await db
            .insert(matchSquadMembers)
            .values({
              squadId: candidate.id,
              endUserId,
              tenantId,
              role: "member",
            })
            .onConflictDoNothing();

          const members = await loadMatchSquadMembers(candidate.id);
          return { ...updated, members };
        }
        // Version conflict or full — try next candidate
      }

      // No open squad with space — create a new one
      const [squad] = await db
        .insert(matchSquads)
        .values({
          tenantId,
          configId: config.id,
          leaderUserId: endUserId,
          status: "open",
          memberCount: 1,
          version: 1,
          metadata: null,
        })
        .returning();
      if (!squad) throw new Error("insert returned no row");

      const [member] = await db
        .insert(matchSquadMembers)
        .values({
          squadId: squad.id,
          endUserId,
          tenantId,
          role: "leader",
        })
        .returning();
      if (!member) throw new Error("insert returned no row");

      return { ...squad, members: [member] };
    },
  };
}

export type TeamService = ReturnType<typeof createMatchSquadService>;

