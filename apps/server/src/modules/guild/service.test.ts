/**
 * Service-layer tests for the guild module.
 *
 * These talk to the real Neon dev branch configured in `.dev.vars` —
 * no mocks. The `createGuildService` factory is invoked directly with
 * the real `db` singleton, bypassing HTTP and Better Auth entirely. A
 * single test org is seeded in `beforeAll` and deleted in `afterAll`;
 * ON DELETE CASCADE sweeps up every guild, member, request, and
 * contribution log row.
 *
 * All endUserIds must be unique within this file because they share
 * the single test org.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import {
  GuildAlreadyInGuild,
  GuildInsufficientPermission,
  GuildSettingsNotFound,
} from "./errors";
import { createGuildService } from "./service";

describe("guild service", () => {
  const svc = createGuildService({ db });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("guild-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── Settings ───────────────────────────────────────────────────

  test("1. getSettings returns error when no settings exist", async () => {
    await expect(svc.getSettings(orgId)).rejects.toThrow(GuildSettingsNotFound);
  });

  test("2. upsertSettings creates settings", async () => {
    const s = await svc.upsertSettings(orgId, {
      maxMembers: 30,
      maxOfficers: 3,
      joinMode: "request",
    });
    expect(s.tenantId).toBe(orgId);
    expect(s.maxMembers).toBe(30);
    expect(s.maxOfficers).toBe(3);
    expect(s.joinMode).toBe("request");
  });

  test("3. upsertSettings updates existing settings", async () => {
    const s = await svc.upsertSettings(orgId, { maxMembers: 40 });
    expect(s.maxMembers).toBe(40);
    // maxOfficers should remain from previous upsert
    expect(s.maxOfficers).toBe(3);
  });

  // ─── Guild Creation ─────────────────────────────────────────────

  /** Shared state: first guild created in test 4. */
  let guildId: string;

  test("4. createGuild creates a guild with leader member, memberCount=1", async () => {
    const { guild, member } = await svc.createGuild(orgId, "gu-leader", {
      name: "Test Guild Alpha",
      description: "Alpha desc",
    });
    guildId = guild.id;
    expect(guild.name).toBe("Test Guild Alpha");
    expect(guild.leaderUserId).toBe("gu-leader");
    expect(guild.memberCount).toBe(1);
    expect(guild.isActive).toBe(true);
    expect(member.role).toBe("leader");
    expect(member.endUserId).toBe("gu-leader");
  });

  test("5. createGuild with user already in a guild throws GuildAlreadyInGuild", async () => {
    await expect(
      svc.createGuild(orgId, "gu-leader", { name: "Duplicate Guild" }),
    ).rejects.toThrow(GuildAlreadyInGuild);
  });

  // ─── Guild Info ─────────────────────────────────────────────────

  test("6. getGuild returns guild details", async () => {
    const guild = await svc.getGuild(orgId, guildId);
    expect(guild.id).toBe(guildId);
    expect(guild.name).toBe("Test Guild Alpha");
  });

  test("7. listGuilds returns guilds (paginated)", async () => {
    const result = await svc.listGuilds(orgId, { limit: 10 });
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    const found = result.items.find((g) => g.id === guildId);
    expect(found).toBeDefined();
  });

  test("8. getMyGuild returns the user's guild", async () => {
    const result = await svc.getMyGuild(orgId, "gu-leader");
    expect(result).not.toBeNull();
    expect(result!.guild.id).toBe(guildId);
    expect(result!.member.role).toBe("leader");
  });

  test("9. updateGuild updates name/description/announcement", async () => {
    const updated = await svc.updateGuild(orgId, guildId, {
      name: "Alpha Renamed",
      description: "New desc",
      announcement: "Hello guild!",
    });
    expect(updated.name).toBe("Alpha Renamed");
    expect(updated.description).toBe("New desc");
    expect(updated.announcement).toBe("Hello guild!");
  });

  // ─── Join Flow (request mode) ───────────────────────────────────

  let joinRequestId: string;

  test("10. applyToJoin creates a pending application", async () => {
    const req = await svc.applyToJoin(orgId, guildId, "gu-applicant1", "Please let me in");
    joinRequestId = req.id;
    expect(req.status).toBe("pending");
    expect(req.type).toBe("application");
    expect(req.endUserId).toBe("gu-applicant1");
    expect(req.message).toBe("Please let me in");
  });

  test("11. acceptJoinRequest adds member, increments memberCount", async () => {
    const { request, member } = await svc.acceptJoinRequest(orgId, joinRequestId, "gu-leader");
    expect(request.status).toBe("accepted");
    expect(member.role).toBe("member");
    expect(member.endUserId).toBe("gu-applicant1");

    const guild = await svc.getGuild(orgId, guildId);
    expect(guild.memberCount).toBe(2);
  });

  test("12. rejectJoinRequest transitions to rejected", async () => {
    // Create a new application to reject
    const req = await svc.applyToJoin(orgId, guildId, "gu-rejected1", "Reject me");
    const rejected = await svc.rejectJoinRequest(orgId, req.id, "gu-leader");
    expect(rejected.status).toBe("rejected");
    expect(rejected.respondedAt).toBeInstanceOf(Date);
  });

  test("13. Joining an 'open' guild via applyToJoin auto-joins", async () => {
    // Create a separate guild with open joinMode
    const { guild: openGuild } = await svc.createGuild(orgId, "gu-open-leader", {
      name: "Open Guild",
      joinMode: "open",
    });

    const req = await svc.applyToJoin(orgId, openGuild.id, "gu-open-joiner");
    expect(req.status).toBe("accepted");

    const guild = await svc.getGuild(orgId, openGuild.id);
    expect(guild.memberCount).toBe(2);

    // Verify the user is actually a member
    const myGuild = await svc.getMyGuild(orgId, "gu-open-joiner");
    expect(myGuild).not.toBeNull();
    expect(myGuild!.guild.id).toBe(openGuild.id);
  });

  // ─── Invitation Flow ───────────────────────────────────────────

  let invitationId: string;

  test("14. inviteUser creates a pending invitation", async () => {
    const req = await svc.inviteUser(orgId, guildId, "gu-leader", "gu-invitee1");
    invitationId = req.id;
    expect(req.status).toBe("pending");
    expect(req.type).toBe("invitation");
    expect(req.endUserId).toBe("gu-invitee1");
    expect(req.invitedBy).toBe("gu-leader");
  });

  test("15. acceptInvitation adds member", async () => {
    const { request, member } = await svc.acceptInvitation(orgId, invitationId, "gu-invitee1");
    expect(request.status).toBe("accepted");
    expect(member.role).toBe("member");
    expect(member.endUserId).toBe("gu-invitee1");

    const guild = await svc.getGuild(orgId, guildId);
    // memberCount was 2 after test 11, now should be 3
    expect(guild.memberCount).toBe(3);
  });

  test("16. rejectInvitation transitions to rejected", async () => {
    const invite = await svc.inviteUser(orgId, guildId, "gu-leader", "gu-invitee-rej");
    const rejected = await svc.rejectInvitation(orgId, invite.id, "gu-invitee-rej");
    expect(rejected.status).toBe("rejected");
    expect(rejected.respondedAt).toBeInstanceOf(Date);
  });

  // ─── Membership Management ─────────────────────────────────────

  test("17. promoteMember changes role to officer", async () => {
    const promoted = await svc.promoteMember(orgId, guildId, "gu-leader", "gu-applicant1");
    expect(promoted.role).toBe("officer");
  });

  test("18. demoteMember changes role to member", async () => {
    const demoted = await svc.demoteMember(orgId, guildId, "gu-leader", "gu-applicant1");
    expect(demoted.role).toBe("member");
  });

  test("19. kickMember removes member, decrements memberCount", async () => {
    // Kick gu-invitee1 (currently a member)
    await svc.kickMember(orgId, guildId, "gu-leader", "gu-invitee1");
    const guild = await svc.getGuild(orgId, guildId);
    expect(guild.memberCount).toBe(2);

    // Verify they have no guild now
    const myGuild = await svc.getMyGuild(orgId, "gu-invitee1");
    expect(myGuild).toBeNull();
  });

  test("20. leaveGuild removes member, decrements memberCount", async () => {
    // gu-applicant1 leaves (they are a member after demotion in test 18)
    await svc.leaveGuild(orgId, guildId, "gu-applicant1");
    const guild = await svc.getGuild(orgId, guildId);
    expect(guild.memberCount).toBe(1);
  });

  test("21. transferLeader swaps leader role", async () => {
    // First, add a new member to transfer leadership to
    const req = await svc.applyToJoin(orgId, guildId, "gu-newleader", "Transfer target");
    await svc.acceptJoinRequest(orgId, req.id, "gu-leader");

    await svc.transferLeader(orgId, guildId, "gu-leader", "gu-newleader");

    const myGuild = await svc.getMyGuild(orgId, "gu-newleader");
    expect(myGuild).not.toBeNull();
    expect(myGuild!.member.role).toBe("leader");

    const oldLeader = await svc.getMyGuild(orgId, "gu-leader");
    expect(oldLeader).not.toBeNull();
    expect(oldLeader!.member.role).toBe("officer");

    const guild = await svc.getGuild(orgId, guildId);
    expect(guild.leaderUserId).toBe("gu-newleader");

    // Transfer back so later tests still have gu-leader as leader
    await svc.transferLeader(orgId, guildId, "gu-newleader", "gu-leader");
  });

  // ─── Guild Disband ──────────────────────────────────────────────

  test("22. disbandGuild sets isActive=false, disbandedAt", async () => {
    // Create a guild specifically for disbanding
    // First, gu-newleader needs to leave the main guild
    await svc.leaveGuild(orgId, guildId, "gu-newleader");

    const { guild: disbandGuild } = await svc.createGuild(orgId, "gu-disband-leader", {
      name: "Disband Me",
    });
    const disbanded = await svc.disbandGuild(orgId, disbandGuild.id);
    expect(disbanded.isActive).toBe(false);
    expect(disbanded.disbandedAt).toBeInstanceOf(Date);
  });

  // ─── Contribution ──────────────────────────────────────────────

  test("23. contribute adds to member contribution and guild experience", async () => {
    const guildBefore = await svc.getGuild(orgId, guildId);
    const log = await svc.contribute(orgId, guildId, "gu-leader", 50, "quest", "q-1");
    expect(log.delta).toBe(50);
    expect(log.guildExpDelta).toBe(50);
    expect(log.source).toBe("quest");
    expect(log.sourceId).toBe("q-1");

    const guildAfter = await svc.getGuild(orgId, guildId);
    expect(guildAfter.experience).toBe(guildBefore.experience + 50);
  });

  test("24. listContributions shows contribution history", async () => {
    const logs = await svc.listContributions(orgId, guildId);
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const found = logs.find((l) => l.source === "quest" && l.sourceId === "q-1");
    expect(found).toBeDefined();
  });

  // ─── One-Guild-Per-User Enforcement ─────────────────────────────

  test("25. User in guild A cannot join guild B", async () => {
    // gu-leader is in guildId (guild A). Try to join the open guild.
    // Need a fresh guild (the open guild's leader is "gu-open-leader")
    // Create guild B with a different leader
    const { guild: guildB } = await svc.createGuild(orgId, "gu-b-leader", {
      name: "Guild B",
      joinMode: "open",
    });

    // gu-leader is already in guild A, so applying to guild B should fail
    await expect(
      svc.applyToJoin(orgId, guildB.id, "gu-leader"),
    ).rejects.toThrow(GuildAlreadyInGuild);
  });

  // ─── Permission Checks ─────────────────────────────────────────

  test("26. Only leader/officer can accept requests", async () => {
    // Add a regular member to test permissions
    const addReq = await svc.applyToJoin(orgId, guildId, "gu-perm-member");
    await svc.acceptJoinRequest(orgId, addReq.id, "gu-leader");

    // Create a new applicant
    const newReq = await svc.applyToJoin(orgId, guildId, "gu-perm-applicant");

    // A regular member trying to accept should fail
    await expect(
      svc.acceptJoinRequest(orgId, newReq.id, "gu-perm-member"),
    ).rejects.toThrow(GuildInsufficientPermission);

    // Clean up: reject the pending request so it doesn't interfere
    await svc.rejectJoinRequest(orgId, newReq.id, "gu-leader");
  });

  test("27. Only leader can kick officers", async () => {
    // Promote gu-perm-member to officer
    await svc.promoteMember(orgId, guildId, "gu-leader", "gu-perm-member");

    // Add another member
    const addReq2 = await svc.applyToJoin(orgId, guildId, "gu-perm-member2");
    await svc.acceptJoinRequest(orgId, addReq2.id, "gu-leader");

    // Officer trying to kick another officer should fail
    // First promote gu-perm-member2 to officer too
    await svc.promoteMember(orgId, guildId, "gu-leader", "gu-perm-member2");

    await expect(
      svc.kickMember(orgId, guildId, "gu-perm-member", "gu-perm-member2"),
    ).rejects.toThrow(GuildInsufficientPermission);

    // But leader can kick officers
    await svc.kickMember(orgId, guildId, "gu-leader", "gu-perm-member2");
  });

  test("28. Members cannot promote/demote", async () => {
    // Add a regular member for the test
    const addReq = await svc.applyToJoin(orgId, guildId, "gu-perm-regular");
    await svc.acceptJoinRequest(orgId, addReq.id, "gu-leader");

    // Demote gu-perm-member back to member first
    await svc.demoteMember(orgId, guildId, "gu-leader", "gu-perm-member");

    // Regular member trying to promote should fail
    await expect(
      svc.promoteMember(orgId, guildId, "gu-perm-member", "gu-perm-regular"),
    ).rejects.toThrow(GuildInsufficientPermission);

    // Regular member trying to demote should also fail
    // (Need to promote someone first so there's someone to demote)
    await svc.promoteMember(orgId, guildId, "gu-leader", "gu-perm-regular");
    await expect(
      svc.demoteMember(orgId, guildId, "gu-perm-member", "gu-perm-regular"),
    ).rejects.toThrow(GuildInsufficientPermission);
  });
});
