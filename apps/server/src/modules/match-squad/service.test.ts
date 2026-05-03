/**
 * Service-layer tests for the match-squad module.
 *
 * These talk to the real Neon dev branch configured in `.dev.vars` --
 * no mocks. The `createMatchSquadService` factory is invoked directly with
 * the real `db` singleton, bypassing HTTP and Better Auth entirely. A
 * single test org is seeded in `beforeAll` and deleted in `afterAll`;
 * ON DELETE CASCADE sweeps up every squad config, squad, member, and
 * invitation row.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import {
  MatchSquadAlreadyDissolved,
  MatchSquadAlreadyMember,
  MatchSquadConfigAliasConflict,
  MatchSquadConfigNotFound,
  MatchSquadFull,
  MatchSquadNotLeader,
  MatchSquadNotMember,
} from "./errors";
import { createMatchSquadService } from "./service";

describe("squad service", () => {
  const svc = createMatchSquadService({ db });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("squad-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── Config CRUD ───────────────────────────────────────────────

  describe("config CRUD", () => {
    test("createConfig creates a squad config", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Config Create Test",
        alias: "cfg-create",
        maxMembers: 5,
      });
      expect(cfg.id).toBeDefined();
      expect(cfg.tenantId).toBe(orgId);
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
      const list = (await svc.listConfigs(orgId)).items;
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
        MatchSquadConfigNotFound,
      );
    });

    test("createConfig with duplicate alias throws MatchSquadConfigAliasConflict", async () => {
      await svc.createConfig(orgId, {
        name: "Alias Dup 1",
        alias: "cfg-dup-alias",
      });
      await expect(
        svc.createConfig(orgId, {
          name: "Alias Dup 2",
          alias: "cfg-dup-alias",
        }),
      ).rejects.toThrow(MatchSquadConfigAliasConflict);
    });
  });

  // ─── MatchSquad Lifecycle ────────────────────────────────────────────

  describe("squad lifecycle", () => {
    test("createTeam creates a squad with leader, memberCount=1", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Lifecycle",
        alias: "lc-create",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u1");
      expect(squad.id).toBeDefined();
      expect(squad.leaderUserId).toBe("tm-u1");
      expect(squad.memberCount).toBe(1);
      expect(squad.status).toBe("open");
      expect(squad.version).toBe(1);
      expect(squad.members).toHaveLength(1);
      expect(squad.members[0]!.endUserId).toBe("tm-u1");
      expect(squad.members[0]!.role).toBe("leader");
    });

    test("getTeam returns squad details with members", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Get MatchSquad",
        alias: "lc-getteam",
        maxMembers: 4,
      });
      const created = await svc.createMatchSquad(orgId, cfg.id, "tm-u2");
      const squad = await svc.getMatchSquad(orgId, created.id);
      expect(squad.id).toBe(created.id);
      expect(squad.members).toHaveLength(1);
      expect(squad.members[0]!.endUserId).toBe("tm-u2");
    });

    test("joinTeam joins an open squad, increments memberCount", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Join MatchSquad",
        alias: "lc-join",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u3");
      const joined = await svc.joinMatchSquad(orgId, squad.id, "tm-u4");
      expect(joined.memberCount).toBe(2);
      expect(joined.members).toHaveLength(2);
      const roles = joined.members.map((m) => m.endUserId);
      expect(roles).toContain("tm-u3");
      expect(roles).toContain("tm-u4");
    });

    test("joinTeam on full squad throws MatchSquadFull", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Full MatchSquad",
        alias: "lc-full",
        maxMembers: 2,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u5");
      await svc.joinMatchSquad(orgId, squad.id, "tm-u6");
      // MatchSquad is now full (2/2)
      await expect(svc.joinMatchSquad(orgId, squad.id, "tm-u7")).rejects.toThrow(
        MatchSquadFull,
      );
    });

    test("leaveTeam by non-leader decrements memberCount", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Leave MatchSquad",
        alias: "lc-leave",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u8");
      await svc.joinMatchSquad(orgId, squad.id, "tm-u9");
      const after = await svc.leaveMatchSquad(orgId, squad.id, "tm-u9");
      expect(after.memberCount).toBe(1);
      expect(after.leaderUserId).toBe("tm-u8");
    });

    test("leaveTeam by leader with autoDissolve=true dissolves squad", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Auto Dissolve",
        alias: "lc-autodiss",
        maxMembers: 4,
        autoDissolveOnLeaderLeave: true,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u10");
      await svc.joinMatchSquad(orgId, squad.id, "tm-u11");
      const after = await svc.leaveMatchSquad(orgId, squad.id, "tm-u10");
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
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u12");
      await svc.joinMatchSquad(orgId, squad.id, "tm-u13");
      const after = await svc.leaveMatchSquad(orgId, squad.id, "tm-u12");
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
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u14");
      const dissolved = await svc.dissolveMatchSquad(orgId, squad.id, "tm-u14");
      expect(dissolved.status).toBe("dissolved");
      expect(dissolved.dissolvedAt).toBeInstanceOf(Date);
    });

    test("dissolveTeam by non-leader throws MatchSquadNotLeader", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Dissolve Non-Leader",
        alias: "lc-diss-nonldr",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u15");
      await svc.joinMatchSquad(orgId, squad.id, "tm-u16");
      await expect(
        svc.dissolveMatchSquad(orgId, squad.id, "tm-u16"),
      ).rejects.toThrow(MatchSquadNotLeader);
    });
  });

  // ─── One-MatchSquad-At-A-Time ────────────────────────────────────────

  describe("one-squad-at-a-time", () => {
    test("user in squad A cannot create squad B under the same config", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "One MatchSquad",
        alias: "otat-create",
        maxMembers: 4,
      });
      await svc.createMatchSquad(orgId, cfg.id, "tm-u17");
      await expect(
        svc.createMatchSquad(orgId, cfg.id, "tm-u17"),
      ).rejects.toThrow(MatchSquadAlreadyMember);
    });

    test("user in squad A cannot join squad B under the same config", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "One MatchSquad Join",
        alias: "otat-join",
        maxMembers: 4,
      });
      const teamA = await svc.createMatchSquad(orgId, cfg.id, "tm-u18");
      // another user creates squad B
      await svc.createMatchSquad(orgId, cfg.id, "tm-u19");
      // tm-u18 is already in teamA, can't join teamB
      // but we need tm-u20 to try joining teamA while already in another squad
      await svc.joinMatchSquad(orgId, teamA.id, "tm-u20");
      // tm-u20 is now in teamA, can't join any other squad under same config
      const teamC = await svc.createMatchSquad(orgId, cfg.id, "tm-u21");
      await expect(
        svc.joinMatchSquad(orgId, teamC.id, "tm-u20"),
      ).rejects.toThrow(MatchSquadAlreadyMember);
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
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u22");
      await svc.joinMatchSquad(orgId, squad.id, "tm-u23");

      const updated = await svc.transferLeader(
        orgId,
        squad.id,
        "tm-u22",
        "tm-u23",
      );
      expect(updated.leaderUserId).toBe("tm-u23");

      // Verify member roles
      const detail = await svc.getMatchSquad(orgId, squad.id);
      const leaderMember = detail.members.find(
        (m) => m.endUserId === "tm-u23",
      );
      const formerLeader = detail.members.find(
        (m) => m.endUserId === "tm-u22",
      );
      expect(leaderMember!.role).toBe("leader");
      expect(formerLeader!.role).toBe("member");
    });

    test("transferLeader by non-leader throws MatchSquadNotLeader", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Transfer NotLeader",
        alias: "ldr-xfer-nl",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u24");
      await svc.joinMatchSquad(orgId, squad.id, "tm-u25");
      await expect(
        svc.transferLeader(orgId, squad.id, "tm-u25", "tm-u24"),
      ).rejects.toThrow(MatchSquadNotLeader);
    });

    test("kickMember by leader removes member", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Kick",
        alias: "ldr-kick",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u26");
      await svc.joinMatchSquad(orgId, squad.id, "tm-u27");

      const updated = await svc.kickMember(
        orgId,
        squad.id,
        "tm-u26",
        "tm-u27",
      );
      expect(updated.memberCount).toBe(1);

      const detail = await svc.getMatchSquad(orgId, squad.id);
      expect(detail.members).toHaveLength(1);
      expect(detail.members[0]!.endUserId).toBe("tm-u26");
    });

    test("kickMember by non-leader throws MatchSquadNotLeader", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Kick NotLeader",
        alias: "ldr-kick-nl",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u28");
      await svc.joinMatchSquad(orgId, squad.id, "tm-u29");
      await expect(
        svc.kickMember(orgId, squad.id, "tm-u29", "tm-u28"),
      ).rejects.toThrow(MatchSquadNotLeader);
    });

    test("kickMember cannot kick self", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Kick Self",
        alias: "ldr-kick-self",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u30");
      await expect(
        svc.kickMember(orgId, squad.id, "tm-u30", "tm-u30"),
      ).rejects.toThrow(MatchSquadNotMember);
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
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u31");

      const closed = await svc.updateMatchSquadStatus(
        orgId,
        squad.id,
        "tm-u31",
        "closed",
      );
      expect(closed.status).toBe("closed");

      const inGame = await svc.updateMatchSquadStatus(
        orgId,
        squad.id,
        "tm-u31",
        "in_game",
      );
      expect(inGame.status).toBe("in_game");
    });

    test("updateTeamStatus by non-leader throws MatchSquadNotLeader", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Status NotLeader",
        alias: "st-nl",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u32");
      await svc.joinMatchSquad(orgId, squad.id, "tm-u33");
      await expect(
        svc.updateMatchSquadStatus(orgId, squad.id, "tm-u33", "closed"),
      ).rejects.toThrow(MatchSquadNotLeader);
    });

    test("updateTeamStatus on dissolved squad throws MatchSquadAlreadyDissolved", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Status Dissolved",
        alias: "st-dissolved",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u34");
      await svc.dissolveMatchSquad(orgId, squad.id, "tm-u34");
      await expect(
        svc.updateMatchSquadStatus(orgId, squad.id, "tm-u34", "open"),
      ).rejects.toThrow(MatchSquadAlreadyDissolved);
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
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u35");
      const inv = await svc.inviteUser(orgId, squad.id, "tm-u35", "tm-u36");
      expect(inv.id).toBeDefined();
      expect(inv.squadId).toBe(squad.id);
      expect(inv.fromUserId).toBe("tm-u35");
      expect(inv.toUserId).toBe("tm-u36");
      expect(inv.status).toBe("pending");
      expect(inv.expiresAt).toBeInstanceOf(Date);
    });

    test("acceptInvitation joins the user to the squad", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Accept Invite",
        alias: "inv-accept",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u37");
      const inv = await svc.inviteUser(orgId, squad.id, "tm-u37", "tm-u38");

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
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u39");
      const inv = await svc.inviteUser(orgId, squad.id, "tm-u39", "tm-u40");

      const rejected = await svc.rejectInvitation(orgId, inv.id, "tm-u40");
      expect(rejected.status).toBe("rejected");
    });

    test("inviteUser throws if invitee already in a squad for this config", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Invite Already In",
        alias: "inv-alrdy",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u41");
      // tm-u42 creates their own squad under same config
      await svc.createMatchSquad(orgId, cfg.id, "tm-u42");
      await expect(
        svc.inviteUser(orgId, squad.id, "tm-u41", "tm-u42"),
      ).rejects.toThrow(MatchSquadAlreadyMember);
    });

    test("inviteUser throws if inviter is not a member", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Invite Non-Member",
        alias: "inv-nonmem",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u43");
      await expect(
        svc.inviteUser(orgId, squad.id, "tm-u44-outsider", "tm-u45"),
      ).rejects.toThrow(MatchSquadNotMember);
    });
  });

  // ─── Quick Match ───────────────────────────────────────────────

  describe("quick match", () => {
    test("quickMatch joins an existing open squad", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Quick Match Join",
        alias: "qm-join",
        maxMembers: 4,
        allowQuickMatch: true,
      });
      // Create a squad that's waiting for members
      await svc.createMatchSquad(orgId, cfg.id, "tm-u46");

      // Quick match should put tm-u47 into the existing squad
      const result = await svc.quickMatch(orgId, "qm-join", "tm-u47");
      expect(result.memberCount).toBe(2);
      expect(result.members).toHaveLength(2);
      const userIds = result.members.map((m) => m.endUserId);
      expect(userIds).toContain("tm-u46");
      expect(userIds).toContain("tm-u47");
    });

    test("quickMatch creates new squad when none available", async () => {
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

    test("quickMatch returns existing squad if user already in one", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Quick Match Existing",
        alias: "qm-existing",
        maxMembers: 4,
        allowQuickMatch: true,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u49");

      // Calling quickMatch again returns the existing squad, not a new one
      const result = await svc.quickMatch(orgId, "qm-existing", "tm-u49");
      expect(result.id).toBe(squad.id);
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
      ).rejects.toThrow(MatchSquadConfigNotFound);
    });

    test("quickMatch creates new when all teams are full", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Quick Match All Full",
        alias: "qm-allfull",
        maxMembers: 1,
        allowQuickMatch: true,
      });
      // Create a squad that is already at capacity (maxMembers=1)
      await svc.createMatchSquad(orgId, cfg.id, "tm-u51");

      // Quick match should create a new squad since the existing one is full
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
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u53");
      await svc.joinMatchSquad(orgId, squad.id, "tm-u54");

      // Admin dissolve does not require endUserId
      const dissolved = await svc.adminDissolveMatchSquad(orgId, squad.id);
      expect(dissolved.status).toBe("dissolved");
      expect(dissolved.dissolvedAt).toBeInstanceOf(Date);

      // Members should be removed
      const detail = await svc.getMatchSquad(orgId, squad.id);
      expect(detail.members).toHaveLength(0);
    });

    test("adminDissolveTeam on already dissolved throws", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Admin Dissolve Already",
        alias: "adm-diss-alrdy",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u55");
      await svc.adminDissolveMatchSquad(orgId, squad.id);
      await expect(svc.adminDissolveMatchSquad(orgId, squad.id)).rejects.toThrow(
        MatchSquadAlreadyDissolved,
      );
    });

    test("listTeams returns active teams", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "List Teams",
        alias: "adm-list",
        maxMembers: 4,
      });
      const team1 = await svc.createMatchSquad(orgId, cfg.id, "tm-u56");
      await svc.createMatchSquad(orgId, cfg.id, "tm-u57");

      const result = await svc.listMatchSquads(orgId, {
        configKey: cfg.id,
        status: "open",
      });
      const initialCount = result.items.length;
      expect(initialCount).toBeGreaterThanOrEqual(2);

      // Dissolve one and filter by open status
      await svc.dissolveMatchSquad(orgId, team1.id, "tm-u56");
      const afterDissolve = await svc.listMatchSquads(orgId, {
        configKey: cfg.id,
        status: "open",
      });
      // At least one less open squad for this config
      expect(afterDissolve.items.length).toBeLessThan(initialCount);
    });

    test("listTeams pagination works", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "List Pagination",
        alias: "adm-page",
        maxMembers: 4,
      });
      await svc.createMatchSquad(orgId, cfg.id, "tm-u58");
      await svc.createMatchSquad(orgId, cfg.id, "tm-u59");
      await svc.createMatchSquad(orgId, cfg.id, "tm-u60");

      const page1 = await svc.listMatchSquads(orgId, {
        configKey: cfg.id,
        limit: 2,
      });
      expect(page1.items.length).toBe(2);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await svc.listMatchSquads(orgId, {
        configKey: cfg.id,
        limit: 2,
        cursor: page1.nextCursor ?? undefined,
      });
      expect(page2.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── getMyTeam ─────────────────────────────────────────────────

  describe("getMyTeam", () => {
    test("returns squad when user is in one", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "My MatchSquad",
        alias: "myteam-yes",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u61");
      const myTeam = await svc.getMyMatchSquad(orgId, cfg.id, "tm-u61");
      expect(myTeam).not.toBeNull();
      expect(myTeam!.id).toBe(squad.id);
      expect(myTeam!.members).toHaveLength(1);
    });

    test("returns null when user is not in any squad", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "My MatchSquad None",
        alias: "myteam-no",
        maxMembers: 4,
      });
      const myTeam = await svc.getMyMatchSquad(orgId, cfg.id, "tm-u62");
      expect(myTeam).toBeNull();
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────

  describe("edge cases", () => {
    test("leaveTeam by sole member dissolves squad", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Sole Leave",
        alias: "edge-sole",
        maxMembers: 4,
        autoDissolveOnLeaderLeave: false,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u63");
      // Leader is the only member; leaving dissolves regardless of autoDissolve
      const after = await svc.leaveMatchSquad(orgId, squad.id, "tm-u63");
      expect(after.status).toBe("dissolved");
    });

    test("leaveTeam by non-member throws MatchSquadNotMember", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Leave Non-Member",
        alias: "edge-nonmem",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u64");
      await expect(
        svc.leaveMatchSquad(orgId, squad.id, "tm-u65-outsider"),
      ).rejects.toThrow(MatchSquadNotMember);
    });

    test("joinTeam on closed squad throws MatchSquadFull", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Join Closed",
        alias: "edge-closed",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u66");
      await svc.updateMatchSquadStatus(orgId, squad.id, "tm-u66", "closed");
      // joinTeam checks status !== "open" and throws MatchSquadFull
      await expect(
        svc.joinMatchSquad(orgId, squad.id, "tm-u67"),
      ).rejects.toThrow(MatchSquadFull);
    });

    test("joinTeam on dissolved squad throws MatchSquadAlreadyDissolved", async () => {
      const cfg = await svc.createConfig(orgId, {
        name: "Join Dissolved",
        alias: "edge-diss-join",
        maxMembers: 4,
      });
      const squad = await svc.createMatchSquad(orgId, cfg.id, "tm-u68");
      await svc.dissolveMatchSquad(orgId, squad.id, "tm-u68");
      await expect(
        svc.joinMatchSquad(orgId, squad.id, "tm-u69"),
      ).rejects.toThrow(MatchSquadAlreadyDissolved);
    });
  });
});
