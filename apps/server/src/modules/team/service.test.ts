/**
 * Service-layer tests for the team module.
 *
 * These talk to the real Neon dev branch configured in `.dev.vars` --
 * no mocks. The `createTeamService` factory is invoked directly with
 * the real `db` singleton, bypassing HTTP and Better Auth entirely. A
 * single test org is seeded in `beforeAll` and deleted in `afterAll`;
 * ON DELETE CASCADE sweeps up every team config, team, member, and
 * invitation row.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import {
  TeamAlreadyDissolved,
  TeamAlreadyInTeam,
  TeamConfigAliasConflict,
  TeamConfigNotFound,
  TeamFull,
  TeamNotLeader,
  TeamNotMember,
} from "./errors";
import { createTeamService } from "./service";

describe("team service", () => {
  const svc = createTeamService({ db });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("team-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── Config CRUD ───────────────────────────────────────────────

  describe("config CRUD", () => {
    test("createConfig creates a team config", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Config Create Test",
        alias: "cfg-create",
        maxMembers: 5,
      });
      expect(cfg.id).toBeDefined();
      expect(cfg.organizationId).toBe(orgId);
      expect(cfg.name).toBe("Config Create Test");
      expect(cfg.alias).toBe("cfg-create");
      expect(cfg.maxMembers).toBe(5);
      expect(cfg.autoDissolveOnLeaderLeave).toBe(false);
      expect(cfg.allowQuickMatch).toBe(true);
    });

    test("getConfig by id works", async () => {
      const created = await svc.createConfig(orgId, {
        name: "Get By Id",
        alias: "cfg-getid",
      });
      const fetched = await svc.getConfig(orgId, created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe("Get By Id");
    });

    test("getConfig by alias works", async () => {
      const created = await svc.createConfig(orgId, {
        name: "Get By Alias",
        alias: "cfg-getalias",
      });
      const fetched = await svc.getConfig(orgId, "cfg-getalias");
      expect(fetched.id).toBe(created.id);
      expect(fetched.alias).toBe("cfg-getalias");
    });

    test("listConfigs returns all configs", async () => {
      // At least the configs created by earlier tests exist
      const list = await svc.listConfigs(orgId);
      expect(list.length).toBeGreaterThanOrEqual(3);
      // Ordered by createdAt desc
      for (let i = 1; i < list.length; i++) {
        expect(list[i - 1]!.createdAt.getTime()).toBeGreaterThanOrEqual(
          list[i]!.createdAt.getTime(),
        );
      }
    });

    test("updateConfig updates fields", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Before Update",
        alias: "cfg-upd",
        maxMembers: 3,
      });
      const updated = await svc.updateConfig(orgId, cfg.id, {
        name: "After Update",
        maxMembers: 8,
      });
      expect(updated.name).toBe("After Update");
      expect(updated.maxMembers).toBe(8);
      expect(updated.alias).toBe("cfg-upd"); // unchanged
    });

    test("updateConfig by alias works", async () => {
      await svc.createConfig(orgId, {
        name: "Update By Alias",
        alias: "cfg-upd-alias",
      });
      const updated = await svc.updateConfig(orgId, "cfg-upd-alias", {
        name: "Updated Via Alias",
      });
      expect(updated.name).toBe("Updated Via Alias");
    });

    test("deleteConfig removes config", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "To Delete",
        alias: "cfg-del",
      });
      await svc.deleteConfig(orgId, cfg.id);
      await expect(svc.getConfig(orgId, cfg.id)).rejects.toThrow(
        TeamConfigNotFound,
      );
    });

    test("createConfig with duplicate alias throws TeamConfigAliasConflict", async () => {
      await svc.createConfig(orgId, {
        name: "Alias Dup 1",
        alias: "cfg-dup-alias",
      });
      await expect(
        svc.createConfig(orgId, {
          name: "Alias Dup 2",
          alias: "cfg-dup-alias",
        }),
      ).rejects.toThrow(TeamConfigAliasConflict);
    });
  });

  // ─── Team Lifecycle ────────────────────────────────────────────

  describe("team lifecycle", () => {
    test("createTeam creates a team with leader, memberCount=1", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Lifecycle",
        alias: "lc-create",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u1");
      expect(team.id).toBeDefined();
      expect(team.leaderUserId).toBe("tm-u1");
      expect(team.memberCount).toBe(1);
      expect(team.status).toBe("open");
      expect(team.version).toBe(1);
      expect(team.members).toHaveLength(1);
      expect(team.members[0]!.endUserId).toBe("tm-u1");
      expect(team.members[0]!.role).toBe("leader");
    });

    test("getTeam returns team details with members", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Get Team",
        alias: "lc-getteam",
        maxMembers: 4,
      });
      const created = await svc.createTeam(orgId, cfg.id, "tm-u2");
      const team = await svc.getTeam(orgId, created.id);
      expect(team.id).toBe(created.id);
      expect(team.members).toHaveLength(1);
      expect(team.members[0]!.endUserId).toBe("tm-u2");
    });

    test("joinTeam joins an open team, increments memberCount", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Join Team",
        alias: "lc-join",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u3");
      const joined = await svc.joinTeam(orgId, team.id, "tm-u4");
      expect(joined.memberCount).toBe(2);
      expect(joined.members).toHaveLength(2);
      const roles = joined.members.map((m) => m.endUserId);
      expect(roles).toContain("tm-u3");
      expect(roles).toContain("tm-u4");
    });

    test("joinTeam on full team throws TeamFull", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Full Team",
        alias: "lc-full",
        maxMembers: 2,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u5");
      await svc.joinTeam(orgId, team.id, "tm-u6");
      // Team is now full (2/2)
      await expect(svc.joinTeam(orgId, team.id, "tm-u7")).rejects.toThrow(
        TeamFull,
      );
    });

    test("leaveTeam by non-leader decrements memberCount", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Leave Team",
        alias: "lc-leave",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u8");
      await svc.joinTeam(orgId, team.id, "tm-u9");
      const after = await svc.leaveTeam(orgId, team.id, "tm-u9");
      expect(after.memberCount).toBe(1);
      expect(after.leaderUserId).toBe("tm-u8");
    });

    test("leaveTeam by leader with autoDissolve=true dissolves team", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Auto Dissolve",
        alias: "lc-autodiss",
        maxMembers: 4,
        autoDissolveOnLeaderLeave: true,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u10");
      await svc.joinTeam(orgId, team.id, "tm-u11");
      const after = await svc.leaveTeam(orgId, team.id, "tm-u10");
      expect(after.status).toBe("dissolved");
      expect(after.dissolvedAt).toBeInstanceOf(Date);
    });

    test("leaveTeam by leader without autoDissolve transfers leadership", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Leader Leave Transfer",
        alias: "lc-ldr-xfer",
        maxMembers: 4,
        autoDissolveOnLeaderLeave: false,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u12");
      await svc.joinTeam(orgId, team.id, "tm-u13");
      const after = await svc.leaveTeam(orgId, team.id, "tm-u12");
      expect(after.status).not.toBe("dissolved");
      expect(after.leaderUserId).toBe("tm-u13");
      expect(after.memberCount).toBe(1);
    });

    test("dissolveTeam by leader sets status=dissolved", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Dissolve",
        alias: "lc-dissolve",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u14");
      const dissolved = await svc.dissolveTeam(orgId, team.id, "tm-u14");
      expect(dissolved.status).toBe("dissolved");
      expect(dissolved.dissolvedAt).toBeInstanceOf(Date);
    });

    test("dissolveTeam by non-leader throws TeamNotLeader", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Dissolve Non-Leader",
        alias: "lc-diss-nonldr",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u15");
      await svc.joinTeam(orgId, team.id, "tm-u16");
      await expect(
        svc.dissolveTeam(orgId, team.id, "tm-u16"),
      ).rejects.toThrow(TeamNotLeader);
    });
  });

  // ─── One-Team-At-A-Time ────────────────────────────────────────

  describe("one-team-at-a-time", () => {
    test("user in team A cannot create team B under the same config", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "One Team",
        alias: "otat-create",
        maxMembers: 4,
      });
      await svc.createTeam(orgId, cfg.id, "tm-u17");
      await expect(
        svc.createTeam(orgId, cfg.id, "tm-u17"),
      ).rejects.toThrow(TeamAlreadyInTeam);
    });

    test("user in team A cannot join team B under the same config", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "One Team Join",
        alias: "otat-join",
        maxMembers: 4,
      });
      const teamA = await svc.createTeam(orgId, cfg.id, "tm-u18");
      // another user creates team B
      await svc.createTeam(orgId, cfg.id, "tm-u19");
      // tm-u18 is already in teamA, can't join teamB
      // but we need tm-u20 to try joining teamA while already in another team
      await svc.joinTeam(orgId, teamA.id, "tm-u20");
      // tm-u20 is now in teamA, can't join any other team under same config
      const teamC = await svc.createTeam(orgId, cfg.id, "tm-u21");
      await expect(
        svc.joinTeam(orgId, teamC.id, "tm-u20"),
      ).rejects.toThrow(TeamAlreadyInTeam);
    });
  });

  // ─── Leadership ────────────────────────────────────────────────

  describe("leadership", () => {
    test("transferLeader swaps roles", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Transfer",
        alias: "ldr-xfer",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u22");
      await svc.joinTeam(orgId, team.id, "tm-u23");

      const updated = await svc.transferLeader(
        orgId,
        team.id,
        "tm-u22",
        "tm-u23",
      );
      expect(updated.leaderUserId).toBe("tm-u23");

      // Verify member roles
      const detail = await svc.getTeam(orgId, team.id);
      const leaderMember = detail.members.find(
        (m) => m.endUserId === "tm-u23",
      );
      const formerLeader = detail.members.find(
        (m) => m.endUserId === "tm-u22",
      );
      expect(leaderMember!.role).toBe("leader");
      expect(formerLeader!.role).toBe("member");
    });

    test("transferLeader by non-leader throws TeamNotLeader", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Transfer NotLeader",
        alias: "ldr-xfer-nl",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u24");
      await svc.joinTeam(orgId, team.id, "tm-u25");
      await expect(
        svc.transferLeader(orgId, team.id, "tm-u25", "tm-u24"),
      ).rejects.toThrow(TeamNotLeader);
    });

    test("kickMember by leader removes member", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Kick",
        alias: "ldr-kick",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u26");
      await svc.joinTeam(orgId, team.id, "tm-u27");

      const updated = await svc.kickMember(
        orgId,
        team.id,
        "tm-u26",
        "tm-u27",
      );
      expect(updated.memberCount).toBe(1);

      const detail = await svc.getTeam(orgId, team.id);
      expect(detail.members).toHaveLength(1);
      expect(detail.members[0]!.endUserId).toBe("tm-u26");
    });

    test("kickMember by non-leader throws TeamNotLeader", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Kick NotLeader",
        alias: "ldr-kick-nl",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u28");
      await svc.joinTeam(orgId, team.id, "tm-u29");
      await expect(
        svc.kickMember(orgId, team.id, "tm-u29", "tm-u28"),
      ).rejects.toThrow(TeamNotLeader);
    });

    test("kickMember cannot kick self", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Kick Self",
        alias: "ldr-kick-self",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u30");
      await expect(
        svc.kickMember(orgId, team.id, "tm-u30", "tm-u30"),
      ).rejects.toThrow(TeamNotMember);
    });
  });

  // ─── Status ────────────────────────────────────────────────────

  describe("status", () => {
    test("updateTeamStatus changes status (open -> closed -> in_game)", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Status",
        alias: "st-change",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u31");

      const closed = await svc.updateTeamStatus(
        orgId,
        team.id,
        "tm-u31",
        "closed",
      );
      expect(closed.status).toBe("closed");

      const inGame = await svc.updateTeamStatus(
        orgId,
        team.id,
        "tm-u31",
        "in_game",
      );
      expect(inGame.status).toBe("in_game");
    });

    test("updateTeamStatus by non-leader throws TeamNotLeader", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Status NotLeader",
        alias: "st-nl",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u32");
      await svc.joinTeam(orgId, team.id, "tm-u33");
      await expect(
        svc.updateTeamStatus(orgId, team.id, "tm-u33", "closed"),
      ).rejects.toThrow(TeamNotLeader);
    });

    test("updateTeamStatus on dissolved team throws TeamAlreadyDissolved", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Status Dissolved",
        alias: "st-dissolved",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u34");
      await svc.dissolveTeam(orgId, team.id, "tm-u34");
      await expect(
        svc.updateTeamStatus(orgId, team.id, "tm-u34", "open"),
      ).rejects.toThrow(TeamAlreadyDissolved);
    });
  });

  // ─── Invitations ───────────────────────────────────────────────

  describe("invitations", () => {
    test("inviteUser creates invitation", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Invite",
        alias: "inv-create",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u35");
      const inv = await svc.inviteUser(orgId, team.id, "tm-u35", "tm-u36");
      expect(inv.id).toBeDefined();
      expect(inv.teamId).toBe(team.id);
      expect(inv.fromUserId).toBe("tm-u35");
      expect(inv.toUserId).toBe("tm-u36");
      expect(inv.status).toBe("pending");
      expect(inv.expiresAt).toBeInstanceOf(Date);
    });

    test("acceptInvitation joins the user to the team", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Accept Invite",
        alias: "inv-accept",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u37");
      const inv = await svc.inviteUser(orgId, team.id, "tm-u37", "tm-u38");

      const result = await svc.acceptInvitation(orgId, inv.id, "tm-u38");
      expect(result.memberCount).toBe(2);
      expect(result.members).toHaveLength(2);
      const userIds = result.members.map((m) => m.endUserId);
      expect(userIds).toContain("tm-u38");
    });

    test("rejectInvitation transitions to rejected", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Reject Invite",
        alias: "inv-reject",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u39");
      const inv = await svc.inviteUser(orgId, team.id, "tm-u39", "tm-u40");

      const rejected = await svc.rejectInvitation(orgId, inv.id, "tm-u40");
      expect(rejected.status).toBe("rejected");
    });

    test("inviteUser throws if invitee already in a team for this config", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Invite Already In",
        alias: "inv-alrdy",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u41");
      // tm-u42 creates their own team under same config
      await svc.createTeam(orgId, cfg.id, "tm-u42");
      await expect(
        svc.inviteUser(orgId, team.id, "tm-u41", "tm-u42"),
      ).rejects.toThrow(TeamAlreadyInTeam);
    });

    test("inviteUser throws if inviter is not a member", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Invite Non-Member",
        alias: "inv-nonmem",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u43");
      await expect(
        svc.inviteUser(orgId, team.id, "tm-u44-outsider", "tm-u45"),
      ).rejects.toThrow(TeamNotMember);
    });
  });

  // ─── Quick Match ───────────────────────────────────────────────

  describe("quick match", () => {
    test("quickMatch joins an existing open team", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Quick Match Join",
        alias: "qm-join",
        maxMembers: 4,
        allowQuickMatch: true,
      });
      // Create a team that's waiting for members
      await svc.createTeam(orgId, cfg.id, "tm-u46");

      // Quick match should put tm-u47 into the existing team
      const result = await svc.quickMatch(orgId, "qm-join", "tm-u47");
      expect(result.memberCount).toBe(2);
      expect(result.members).toHaveLength(2);
      const userIds = result.members.map((m) => m.endUserId);
      expect(userIds).toContain("tm-u46");
      expect(userIds).toContain("tm-u47");
    });

    test("quickMatch creates new team when none available", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Quick Match New",
        alias: "qm-new",
        maxMembers: 2,
        allowQuickMatch: true,
      });

      // Quick match with no existing teams should create one
      const result = await svc.quickMatch(orgId, "qm-new", "tm-u48");
      expect(result.memberCount).toBe(1);
      expect(result.leaderUserId).toBe("tm-u48");
      expect(result.members).toHaveLength(1);
      expect(result.members[0]!.role).toBe("leader");
    });

    test("quickMatch returns existing team if user already in one", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Quick Match Existing",
        alias: "qm-existing",
        maxMembers: 4,
        allowQuickMatch: true,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u49");

      // Calling quickMatch again returns the existing team, not a new one
      const result = await svc.quickMatch(orgId, "qm-existing", "tm-u49");
      expect(result.id).toBe(team.id);
      expect(result.memberCount).toBe(1);
    });

    test("quickMatch with allowQuickMatch=false throws", async () => {
      await svc.createConfig(orgId, {
        name: "Quick Match Disabled",
        alias: "qm-disabled",
        maxMembers: 4,
        allowQuickMatch: false,
      });

      await expect(
        svc.quickMatch(orgId, "qm-disabled", "tm-u50"),
      ).rejects.toThrow(TeamConfigNotFound);
    });

    test("quickMatch creates new when all teams are full", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Quick Match All Full",
        alias: "qm-allfull",
        maxMembers: 1,
        allowQuickMatch: true,
      });
      // Create a team that is already at capacity (maxMembers=1)
      await svc.createTeam(orgId, cfg.id, "tm-u51");

      // Quick match should create a new team since the existing one is full
      const result = await svc.quickMatch(orgId, "qm-allfull", "tm-u52");
      expect(result.leaderUserId).toBe("tm-u52");
      expect(result.memberCount).toBe(1);
    });
  });

  // ─── Admin ─────────────────────────────────────────────────────

  describe("admin", () => {
    test("adminDissolveTeam force-dissolves without leader check", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Admin Dissolve",
        alias: "adm-dissolve",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u53");
      await svc.joinTeam(orgId, team.id, "tm-u54");

      // Admin dissolve does not require endUserId
      const dissolved = await svc.adminDissolveTeam(orgId, team.id);
      expect(dissolved.status).toBe("dissolved");
      expect(dissolved.dissolvedAt).toBeInstanceOf(Date);

      // Members should be removed
      const detail = await svc.getTeam(orgId, team.id);
      expect(detail.members).toHaveLength(0);
    });

    test("adminDissolveTeam on already dissolved throws", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Admin Dissolve Already",
        alias: "adm-diss-alrdy",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u55");
      await svc.adminDissolveTeam(orgId, team.id);
      await expect(svc.adminDissolveTeam(orgId, team.id)).rejects.toThrow(
        TeamAlreadyDissolved,
      );
    });

    test("listTeams returns active teams", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "List Teams",
        alias: "adm-list",
        maxMembers: 4,
      });
      const team1 = await svc.createTeam(orgId, cfg.id, "tm-u56");
      await svc.createTeam(orgId, cfg.id, "tm-u57");

      const result = await svc.listTeams(orgId, {
        configKey: cfg.id,
        status: "open",
      });
      expect(result.items.length).toBeGreaterThanOrEqual(2);
      expect(result.total).toBeGreaterThanOrEqual(2);

      // Dissolve one and filter by open status
      await svc.dissolveTeam(orgId, team1.id, "tm-u56");
      const afterDissolve = await svc.listTeams(orgId, {
        configKey: cfg.id,
        status: "open",
      });
      // At least one less open team for this config
      expect(afterDissolve.total).toBeLessThan(result.total);
    });

    test("listTeams pagination works", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "List Pagination",
        alias: "adm-page",
        maxMembers: 4,
      });
      await svc.createTeam(orgId, cfg.id, "tm-u58");
      await svc.createTeam(orgId, cfg.id, "tm-u59");
      await svc.createTeam(orgId, cfg.id, "tm-u60");

      const page1 = await svc.listTeams(orgId, {
        configKey: cfg.id,
        limit: 2,
        offset: 0,
      });
      expect(page1.items.length).toBe(2);
      expect(page1.total).toBeGreaterThanOrEqual(3);

      const page2 = await svc.listTeams(orgId, {
        configKey: cfg.id,
        limit: 2,
        offset: 2,
      });
      expect(page2.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── getMyTeam ─────────────────────────────────────────────────

  describe("getMyTeam", () => {
    test("returns team when user is in one", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "My Team",
        alias: "myteam-yes",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u61");
      const myTeam = await svc.getMyTeam(orgId, cfg.id, "tm-u61");
      expect(myTeam).not.toBeNull();
      expect(myTeam!.id).toBe(team.id);
      expect(myTeam!.members).toHaveLength(1);
    });

    test("returns null when user is not in any team", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "My Team None",
        alias: "myteam-no",
        maxMembers: 4,
      });
      const myTeam = await svc.getMyTeam(orgId, cfg.id, "tm-u62");
      expect(myTeam).toBeNull();
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────

  describe("edge cases", () => {
    test("leaveTeam by sole member dissolves team", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Sole Leave",
        alias: "edge-sole",
        maxMembers: 4,
        autoDissolveOnLeaderLeave: false,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u63");
      // Leader is the only member; leaving dissolves regardless of autoDissolve
      const after = await svc.leaveTeam(orgId, team.id, "tm-u63");
      expect(after.status).toBe("dissolved");
    });

    test("leaveTeam by non-member throws TeamNotMember", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Leave Non-Member",
        alias: "edge-nonmem",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u64");
      await expect(
        svc.leaveTeam(orgId, team.id, "tm-u65-outsider"),
      ).rejects.toThrow(TeamNotMember);
    });

    test("joinTeam on closed team throws TeamFull", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Join Closed",
        alias: "edge-closed",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u66");
      await svc.updateTeamStatus(orgId, team.id, "tm-u66", "closed");
      // joinTeam checks status !== "open" and throws TeamFull
      await expect(
        svc.joinTeam(orgId, team.id, "tm-u67"),
      ).rejects.toThrow(TeamFull);
    });

    test("joinTeam on dissolved team throws TeamAlreadyDissolved", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Join Dissolved",
        alias: "edge-diss-join",
        maxMembers: 4,
      });
      const team = await svc.createTeam(orgId, cfg.id, "tm-u68");
      await svc.dissolveTeam(orgId, team.id, "tm-u68");
      await expect(
        svc.joinTeam(orgId, team.id, "tm-u69"),
      ).rejects.toThrow(TeamAlreadyDissolved);
    });
  });
});
