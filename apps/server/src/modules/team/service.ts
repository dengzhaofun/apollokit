/**
 * Team service — protocol-agnostic business logic.
 *
 * This file MUST NOT import Hono, @hono/zod-openapi, or any HTTP concepts.
 * Its only bridge to the outside world is the typed `AppDeps` object.
 *
 * ---------------------------------------------------------------------
 * Concurrency strategy — version-guarded single-statement writes
 * ---------------------------------------------------------------------
 *
 * `drizzle-orm/neon-http` runs over Neon's HTTP driver, which does NOT
 * support multi-statement transactions. All writes use single atomic SQL
 * statements with version guards:
 *
 *   UPDATE team_teams
 *   SET member_count = member_count + 1, version = version + 1
 *   WHERE id = ? AND version = ? AND member_count < ?
 *   RETURNING *;
 *
 * If RETURNING yields zero rows, either the team was modified concurrently
 * (version mismatch) or the team is full (member_count >= maxMembers).
 * We re-read to disambiguate and throw the appropriate error.
 *
 * One-team-at-a-time per configId is enforced by checking for existing
 * active membership before joining. A narrow race (two concurrent joins
 * for different teams) could theoretically create a double membership,
 * but for ephemeral game teams this is acceptable — a future partial
 * unique index on (configId, endUserId, active) can close the gap if needed.
 */

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  teamConfigs,
  teamInvitations,
  teamMembers,
  teamTeams,
} from "../../schema/team";
import {
  TeamAlreadyDissolved,
  TeamAlreadyInTeam,
  TeamConcurrencyConflict,
  TeamConfigAliasConflict,
  TeamConfigNotFound,
  TeamFull,
  TeamInvitationNotFound,
  TeamNotFound,
  TeamNotLeader,
  TeamNotMember,
} from "./errors";
import type {
  Team,
  TeamConfig,
  TeamInvitation,
  TeamMember,
  TeamStatus,
  TeamWithMembers,
} from "./types";
import type { CreateConfigInput, UpdateConfigInput } from "./validators";

type TeamDeps = Pick<AppDeps, "db">;

/** Treat strings that look like UUIDs as ids; everything else is an alias. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeId(key: string): boolean {
  return UUID_RE.test(key);
}

const ACTIVE_STATUSES: TeamStatus[] = ["open", "closed", "in_game"];

export function createTeamService(d: TeamDeps) {
  const { db } = d;

  async function loadConfigByKey(
    organizationId: string,
    key: string,
  ): Promise<TeamConfig> {
    const where = looksLikeId(key)
      ? and(
          eq(teamConfigs.organizationId, organizationId),
          eq(teamConfigs.id, key),
        )
      : and(
          eq(teamConfigs.organizationId, organizationId),
          eq(teamConfigs.alias, key),
        );

    const rows = await db.select().from(teamConfigs).where(where).limit(1);
    const row = rows[0];
    if (!row) throw new TeamConfigNotFound(key);
    return row;
  }

  /** Check if endUser is already in an active team for this configId. */
  async function getActiveTeamForUser(
    organizationId: string,
    configId: string,
    endUserId: string,
  ): Promise<Team | null> {
    const rows = await db
      .select({ team: teamTeams })
      .from(teamMembers)
      .innerJoin(teamTeams, eq(teamMembers.teamId, teamTeams.id))
      .where(
        and(
          eq(teamMembers.organizationId, organizationId),
          eq(teamMembers.endUserId, endUserId),
          eq(teamTeams.configId, configId),
          inArray(teamTeams.status, ACTIVE_STATUSES),
        ),
      )
      .limit(1);
    return rows[0]?.team ?? null;
  }

  async function loadTeam(
    organizationId: string,
    teamId: string,
  ): Promise<Team> {
    const rows = await db
      .select()
      .from(teamTeams)
      .where(
        and(
          eq(teamTeams.id, teamId),
          eq(teamTeams.organizationId, organizationId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new TeamNotFound(teamId);
    return row;
  }

  async function loadTeamMembers(teamId: string): Promise<TeamMember[]> {
    return db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(teamMembers.joinedAt);
  }

  function assertNotDissolved(team: Team): void {
    if (team.status === "dissolved") {
      throw new TeamAlreadyDissolved(team.id);
    }
  }

  function assertLeader(team: Team, endUserId: string): void {
    if (team.leaderUserId !== endUserId) {
      throw new TeamNotLeader(endUserId);
    }
  }

  /**
   * Atomically increment memberCount + bump version, guarded by
   * both version and maxMembers.
   * Returns the updated team row or null if the guard failed.
   */
  async function atomicJoin(
    teamId: string,
    expectedVersion: number,
    maxMembers: number,
  ): Promise<Team | null> {
    const rows = await db
      .update(teamTeams)
      .set({
        memberCount: sql`${teamTeams.memberCount} + 1`,
        version: sql`${teamTeams.version} + 1`,
      })
      .where(
        and(
          eq(teamTeams.id, teamId),
          eq(teamTeams.version, expectedVersion),
          sql`${teamTeams.memberCount} < ${maxMembers}`,
        ),
      )
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Atomically decrement memberCount + bump version.
   */
  async function atomicLeave(
    teamId: string,
    expectedVersion: number,
  ): Promise<Team | null> {
    const rows = await db
      .update(teamTeams)
      .set({
        memberCount: sql`${teamTeams.memberCount} - 1`,
        version: sql`${teamTeams.version} + 1`,
      })
      .where(
        and(
          eq(teamTeams.id, teamId),
          eq(teamTeams.version, expectedVersion),
        ),
      )
      .returning();
    return rows[0] ?? null;
  }

  /** Dissolve a team: set status + dissolvedAt, bump version. */
  async function atomicDissolve(
    teamId: string,
    expectedVersion: number,
  ): Promise<Team | null> {
    const rows = await db
      .update(teamTeams)
      .set({
        status: "dissolved",
        dissolvedAt: new Date(),
        version: sql`${teamTeams.version} + 1`,
      })
      .where(
        and(
          eq(teamTeams.id, teamId),
          eq(teamTeams.version, expectedVersion),
          ne(teamTeams.status, "dissolved"),
        ),
      )
      .returning();
    return rows[0] ?? null;
  }

  return {
    // ─── Config CRUD ───────────────────────────────────────────

    async createConfig(
      organizationId: string,
      input: CreateConfigInput,
    ): Promise<TeamConfig> {
      try {
        const [row] = await db
          .insert(teamConfigs)
          .values({
            organizationId,
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
          throw new TeamConfigAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async getConfig(
      organizationId: string,
      idOrAlias: string,
    ): Promise<TeamConfig> {
      return loadConfigByKey(organizationId, idOrAlias);
    },

    async listConfigs(organizationId: string): Promise<TeamConfig[]> {
      return db
        .select()
        .from(teamConfigs)
        .where(eq(teamConfigs.organizationId, organizationId))
        .orderBy(desc(teamConfigs.createdAt));
    },

    async updateConfig(
      organizationId: string,
      key: string,
      patch: UpdateConfigInput,
    ): Promise<TeamConfig> {
      const existing = await loadConfigByKey(organizationId, key);

      const updateValues: Partial<typeof teamConfigs.$inferInsert> = {};
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
          .update(teamConfigs)
          .set(updateValues)
          .where(
            and(
              eq(teamConfigs.id, existing.id),
              eq(teamConfigs.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new TeamConfigNotFound(key);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new TeamConfigAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deleteConfig(organizationId: string, key: string): Promise<void> {
      const existing = await loadConfigByKey(organizationId, key);
      const deleted = await db
        .delete(teamConfigs)
        .where(
          and(
            eq(teamConfigs.id, existing.id),
            eq(teamConfigs.organizationId, organizationId),
          ),
        )
        .returning({ id: teamConfigs.id });
      if (deleted.length === 0) throw new TeamConfigNotFound(key);
    },

    // ─── Team lifecycle ────────────────────────────────────────

    async createTeam(
      organizationId: string,
      configKey: string,
      endUserId: string,
      metadata?: Record<string, unknown> | null,
    ): Promise<TeamWithMembers> {
      const config = await loadConfigByKey(organizationId, configKey);

      // Enforce one-team-at-a-time per configId
      const existing = await getActiveTeamForUser(
        organizationId,
        config.id,
        endUserId,
      );
      if (existing) throw new TeamAlreadyInTeam(endUserId);

      const [team] = await db
        .insert(teamTeams)
        .values({
          organizationId,
          configId: config.id,
          leaderUserId: endUserId,
          status: "open",
          memberCount: 1,
          version: 1,
          metadata: metadata ?? null,
        })
        .returning();
      if (!team) throw new Error("insert returned no row");

      const [member] = await db
        .insert(teamMembers)
        .values({
          teamId: team.id,
          endUserId,
          organizationId,
          role: "leader",
        })
        .returning();
      if (!member) throw new Error("insert returned no row");

      return { ...team, members: [member] };
    },

    async getTeam(
      organizationId: string,
      teamId: string,
    ): Promise<TeamWithMembers> {
      const team = await loadTeam(organizationId, teamId);
      const members = await loadTeamMembers(teamId);
      return { ...team, members };
    },

    async listTeams(
      organizationId: string,
      opts?: {
        configKey?: string;
        status?: TeamStatus;
        limit?: number;
        offset?: number;
      },
    ): Promise<{ items: Team[]; total: number }> {
      const conditions = [eq(teamTeams.organizationId, organizationId)];

      if (opts?.configKey) {
        const config = await loadConfigByKey(organizationId, opts.configKey);
        conditions.push(eq(teamTeams.configId, config.id));
      }
      if (opts?.status) {
        conditions.push(eq(teamTeams.status, opts.status));
      }

      const where = and(...conditions);
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;

      const [items, countResult] = await Promise.all([
        db
          .select()
          .from(teamTeams)
          .where(where)
          .orderBy(desc(teamTeams.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(teamTeams)
          .where(where),
      ]);

      return { items, total: countResult[0]?.count ?? 0 };
    },

    async getMyTeam(
      organizationId: string,
      configKey: string,
      endUserId: string,
    ): Promise<TeamWithMembers | null> {
      const config = await loadConfigByKey(organizationId, configKey);
      const team = await getActiveTeamForUser(
        organizationId,
        config.id,
        endUserId,
      );
      if (!team) return null;
      const members = await loadTeamMembers(team.id);
      return { ...team, members };
    },

    async joinTeam(
      organizationId: string,
      teamId: string,
      endUserId: string,
    ): Promise<TeamWithMembers> {
      const team = await loadTeam(organizationId, teamId);
      assertNotDissolved(team);

      if (team.status !== "open") {
        throw new TeamFull(teamId);
      }

      // Load config to get maxMembers
      const config = await loadConfigByKey(organizationId, team.configId);

      // Enforce one-team-at-a-time
      const existingTeam = await getActiveTeamForUser(
        organizationId,
        config.id,
        endUserId,
      );
      if (existingTeam) throw new TeamAlreadyInTeam(endUserId);

      // Atomic memberCount increment with version + capacity guard
      const updated = await atomicJoin(team.id, team.version, config.maxMembers);
      if (!updated) {
        // Re-read to distinguish full vs. version conflict
        const fresh = await loadTeam(organizationId, teamId);
        if (fresh.memberCount >= config.maxMembers) throw new TeamFull(teamId);
        throw new TeamConcurrencyConflict();
      }

      // Insert member row
      await db
        .insert(teamMembers)
        .values({
          teamId: team.id,
          endUserId,
          organizationId,
          role: "member",
        })
        .onConflictDoNothing();

      const members = await loadTeamMembers(team.id);
      return { ...updated, members };
    },

    async leaveTeam(
      organizationId: string,
      teamId: string,
      endUserId: string,
    ): Promise<Team> {
      const team = await loadTeam(organizationId, teamId);
      assertNotDissolved(team);

      // Check membership
      const memberRows = await db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.endUserId, endUserId),
          ),
        )
        .limit(1);
      if (!memberRows[0]) throw new TeamNotMember(endUserId);

      const isLeader = team.leaderUserId === endUserId;

      // Load config for autoDissolve decision
      const config = await loadConfigByKey(organizationId, team.configId);

      if (isLeader) {
        if (config.autoDissolveOnLeaderLeave || team.memberCount <= 1) {
          // Dissolve team
          const dissolved = await atomicDissolve(team.id, team.version);
          if (!dissolved) throw new TeamConcurrencyConflict();
          // Remove all members
          await db.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
          return dissolved;
        }

        // Transfer leadership to the oldest member
        const otherMembers = await db
          .select()
          .from(teamMembers)
          .where(
            and(
              eq(teamMembers.teamId, teamId),
              ne(teamMembers.endUserId, endUserId),
            ),
          )
          .orderBy(teamMembers.joinedAt)
          .limit(1);

        const newLeader = otherMembers[0];
        if (!newLeader) {
          // No other members — dissolve
          const dissolved = await atomicDissolve(team.id, team.version);
          if (!dissolved) throw new TeamConcurrencyConflict();
          await db.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
          return dissolved;
        }

        // Update leader + decrement count in one shot
        const rows = await db
          .update(teamTeams)
          .set({
            leaderUserId: newLeader.endUserId,
            memberCount: sql`${teamTeams.memberCount} - 1`,
            version: sql`${teamTeams.version} + 1`,
          })
          .where(
            and(
              eq(teamTeams.id, teamId),
              eq(teamTeams.version, team.version),
            ),
          )
          .returning();
        if (!rows[0]) throw new TeamConcurrencyConflict();

        // Promote the new leader's member role
        await db
          .update(teamMembers)
          .set({ role: "leader" })
          .where(
            and(
              eq(teamMembers.teamId, teamId),
              eq(teamMembers.endUserId, newLeader.endUserId),
            ),
          );

        // Remove leaving member
        await db
          .delete(teamMembers)
          .where(
            and(
              eq(teamMembers.teamId, teamId),
              eq(teamMembers.endUserId, endUserId),
            ),
          );

        return rows[0];
      }

      // Non-leader leaves
      const updated = await atomicLeave(team.id, team.version);
      if (!updated) throw new TeamConcurrencyConflict();

      await db
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.endUserId, endUserId),
          ),
        );

      return updated;
    },

    async dissolveTeam(
      organizationId: string,
      teamId: string,
      endUserId: string,
    ): Promise<Team> {
      const team = await loadTeam(organizationId, teamId);
      assertNotDissolved(team);
      assertLeader(team, endUserId);

      const dissolved = await atomicDissolve(team.id, team.version);
      if (!dissolved) throw new TeamConcurrencyConflict();

      // Remove all members
      await db.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
      return dissolved;
    },

    async adminDissolveTeam(
      organizationId: string,
      teamId: string,
    ): Promise<Team> {
      const team = await loadTeam(organizationId, teamId);
      assertNotDissolved(team);

      const dissolved = await atomicDissolve(team.id, team.version);
      if (!dissolved) throw new TeamConcurrencyConflict();

      await db.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
      return dissolved;
    },

    async kickMember(
      organizationId: string,
      teamId: string,
      kickerUserId: string,
      targetUserId: string,
    ): Promise<Team> {
      const team = await loadTeam(organizationId, teamId);
      assertNotDissolved(team);
      assertLeader(team, kickerUserId);

      if (kickerUserId === targetUserId) {
        throw new TeamNotMember(targetUserId);
      }

      // Check target is a member
      const memberRows = await db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.endUserId, targetUserId),
          ),
        )
        .limit(1);
      if (!memberRows[0]) throw new TeamNotMember(targetUserId);

      const updated = await atomicLeave(team.id, team.version);
      if (!updated) throw new TeamConcurrencyConflict();

      await db
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.endUserId, targetUserId),
          ),
        );

      return updated;
    },

    async transferLeader(
      organizationId: string,
      teamId: string,
      currentLeader: string,
      newLeader: string,
    ): Promise<Team> {
      const team = await loadTeam(organizationId, teamId);
      assertNotDissolved(team);
      assertLeader(team, currentLeader);

      // Verify new leader is a member
      const memberRows = await db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.endUserId, newLeader),
          ),
        )
        .limit(1);
      if (!memberRows[0]) throw new TeamNotMember(newLeader);

      const rows = await db
        .update(teamTeams)
        .set({
          leaderUserId: newLeader,
          version: sql`${teamTeams.version} + 1`,
        })
        .where(
          and(
            eq(teamTeams.id, teamId),
            eq(teamTeams.version, team.version),
          ),
        )
        .returning();
      if (!rows[0]) throw new TeamConcurrencyConflict();

      // Update roles
      await db
        .update(teamMembers)
        .set({ role: "member" })
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.endUserId, currentLeader),
          ),
        );
      await db
        .update(teamMembers)
        .set({ role: "leader" })
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.endUserId, newLeader),
          ),
        );

      return rows[0];
    },

    async updateTeamStatus(
      organizationId: string,
      teamId: string,
      endUserId: string,
      status: "open" | "closed" | "in_game",
    ): Promise<Team> {
      const team = await loadTeam(organizationId, teamId);
      assertNotDissolved(team);
      assertLeader(team, endUserId);

      const rows = await db
        .update(teamTeams)
        .set({
          status,
          version: sql`${teamTeams.version} + 1`,
        })
        .where(
          and(
            eq(teamTeams.id, teamId),
            eq(teamTeams.version, team.version),
          ),
        )
        .returning();
      if (!rows[0]) throw new TeamConcurrencyConflict();
      return rows[0];
    },

    // ─── Invitations ───────────────────────────────────────────

    async inviteUser(
      organizationId: string,
      teamId: string,
      fromUserId: string,
      toUserId: string,
    ): Promise<TeamInvitation> {
      const team = await loadTeam(organizationId, teamId);
      assertNotDissolved(team);

      // Verify inviter is a member
      const memberRows = await db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.endUserId, fromUserId),
          ),
        )
        .limit(1);
      if (!memberRows[0]) throw new TeamNotMember(fromUserId);

      // Check invitee isn't already in a team for this config
      const config = await loadConfigByKey(organizationId, team.configId);
      const existingTeam = await getActiveTeamForUser(
        organizationId,
        config.id,
        toUserId,
      );
      if (existingTeam) throw new TeamAlreadyInTeam(toUserId);

      const expiresAt = new Date(Date.now() + 60_000); // 60 seconds

      try {
        const [inv] = await db
          .insert(teamInvitations)
          .values({
            organizationId,
            teamId,
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
          throw new TeamAlreadyInTeam(toUserId);
        }
        throw err;
      }
    },

    async acceptInvitation(
      organizationId: string,
      invitationId: string,
      endUserId: string,
    ): Promise<TeamWithMembers> {
      // Load invitation
      const invRows = await db
        .select()
        .from(teamInvitations)
        .where(
          and(
            eq(teamInvitations.id, invitationId),
            eq(teamInvitations.organizationId, organizationId),
          ),
        )
        .limit(1);
      const inv = invRows[0];
      if (!inv) throw new TeamInvitationNotFound(invitationId);
      if (inv.toUserId !== endUserId) throw new TeamInvitationNotFound(invitationId);
      if (inv.status !== "pending") throw new TeamInvitationNotFound(invitationId);

      // Check expiry
      if (inv.expiresAt && inv.expiresAt < new Date()) {
        // Mark expired
        await db
          .update(teamInvitations)
          .set({ status: "expired", version: sql`${teamInvitations.version} + 1` })
          .where(
            and(
              eq(teamInvitations.id, invitationId),
              eq(teamInvitations.version, inv.version),
            ),
          );
        throw new TeamInvitationNotFound(invitationId);
      }

      // Mark accepted
      const updatedInv = await db
        .update(teamInvitations)
        .set({ status: "accepted", version: sql`${teamInvitations.version} + 1` })
        .where(
          and(
            eq(teamInvitations.id, invitationId),
            eq(teamInvitations.version, inv.version),
          ),
        )
        .returning();
      if (!updatedInv[0]) throw new TeamConcurrencyConflict();

      // Load team
      const team = await loadTeam(organizationId, inv.teamId);
      assertNotDissolved(team);

      const config = await loadConfigByKey(organizationId, team.configId);

      // Enforce one-team-at-a-time
      const existingTeam = await getActiveTeamForUser(
        organizationId,
        config.id,
        endUserId,
      );
      if (existingTeam) throw new TeamAlreadyInTeam(endUserId);

      // Atomic join
      const updated = await atomicJoin(team.id, team.version, config.maxMembers);
      if (!updated) {
        const fresh = await loadTeam(organizationId, inv.teamId);
        if (fresh.memberCount >= config.maxMembers) throw new TeamFull(inv.teamId);
        throw new TeamConcurrencyConflict();
      }

      await db
        .insert(teamMembers)
        .values({
          teamId: team.id,
          endUserId,
          organizationId,
          role: "member",
        })
        .onConflictDoNothing();

      const members = await loadTeamMembers(team.id);
      return { ...updated, members };
    },

    async rejectInvitation(
      organizationId: string,
      invitationId: string,
      endUserId: string,
    ): Promise<TeamInvitation> {
      const invRows = await db
        .select()
        .from(teamInvitations)
        .where(
          and(
            eq(teamInvitations.id, invitationId),
            eq(teamInvitations.organizationId, organizationId),
          ),
        )
        .limit(1);
      const inv = invRows[0];
      if (!inv) throw new TeamInvitationNotFound(invitationId);
      if (inv.toUserId !== endUserId) throw new TeamInvitationNotFound(invitationId);
      if (inv.status !== "pending") throw new TeamInvitationNotFound(invitationId);

      const rows = await db
        .update(teamInvitations)
        .set({ status: "rejected", version: sql`${teamInvitations.version} + 1` })
        .where(
          and(
            eq(teamInvitations.id, invitationId),
            eq(teamInvitations.version, inv.version),
          ),
        )
        .returning();
      if (!rows[0]) throw new TeamConcurrencyConflict();
      return rows[0];
    },

    // ─── Quick match ───────────────────────────────────────────

    async quickMatch(
      organizationId: string,
      configKey: string,
      endUserId: string,
    ): Promise<TeamWithMembers> {
      const config = await loadConfigByKey(organizationId, configKey);

      if (!config.allowQuickMatch) {
        throw new TeamConfigNotFound(configKey);
      }

      // Check if already in a team
      const existingTeam = await getActiveTeamForUser(
        organizationId,
        config.id,
        endUserId,
      );
      if (existingTeam) {
        const members = await loadTeamMembers(existingTeam.id);
        return { ...existingTeam, members };
      }

      // Find the fullest open team with space
      const candidates = await db
        .select()
        .from(teamTeams)
        .where(
          and(
            eq(teamTeams.organizationId, organizationId),
            eq(teamTeams.configId, config.id),
            eq(teamTeams.status, "open"),
            sql`${teamTeams.memberCount} < ${config.maxMembers}`,
          ),
        )
        .orderBy(desc(teamTeams.memberCount))
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
            .insert(teamMembers)
            .values({
              teamId: candidate.id,
              endUserId,
              organizationId,
              role: "member",
            })
            .onConflictDoNothing();

          const members = await loadTeamMembers(candidate.id);
          return { ...updated, members };
        }
        // Version conflict or full — try next candidate
      }

      // No open team with space — create a new one
      const [team] = await db
        .insert(teamTeams)
        .values({
          organizationId,
          configId: config.id,
          leaderUserId: endUserId,
          status: "open",
          memberCount: 1,
          version: 1,
          metadata: null,
        })
        .returning();
      if (!team) throw new Error("insert returned no row");

      const [member] = await db
        .insert(teamMembers)
        .values({
          teamId: team.id,
          endUserId,
          organizationId,
          role: "leader",
        })
        .returning();
      if (!member) throw new Error("insert returned no row");

      return { ...team, members: [member] };
    },
  };
}

export type TeamService = ReturnType<typeof createTeamService>;

/** Detect Postgres unique_violation (SQLSTATE 23505) across driver quirks. */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505")
    return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("23505");
}
