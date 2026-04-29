import { announcementService } from "../../announcement";
import type { Announcement } from "../../announcement/types";
import { registerMention } from "./registry";
import type { MentionDescriptor, MentionResult } from "./types";

/**
 * Announcement is the one Tier-1 module whose `get` only accepts alias
 * (not UUID id) — see queries.ts for the same accommodation. We pack the
 * alias into the `MentionRef.id` field so the protocol stays uniform; the
 * descriptor's `fetch` interprets it as an alias.
 *
 * Announcement's schema declares alias as NOT NULL, so this is safe:
 * every announcement has a usable alias.
 */
const announcementMention: MentionDescriptor<Announcement> = {
  type: "announcement",
  label: "公告",
  toolModuleId: "announcement",
  async search(orgId, q, limit) {
    const page = await announcementService.list(orgId, { q, limit });
    return page.items.map(toResult);
  },
  async fetch(orgId, idOrAlias) {
    // Announcement service only exposes alias-based lookup.
    try {
      return await announcementService.getByAlias(orgId, idOrAlias);
    } catch {
      return null;
    }
  },
  toResult,
  toContextLine(a) {
    return `[announcement] 公告 "${a.title}" (alias=${a.alias}, kind=${a.kind}, active=${a.isActive})`;
  },
};

function toResult(a: Announcement): MentionResult {
  // We pack alias into the `id` field because that's what `fetch` will
  // accept on resolve.
  return {
    type: "announcement",
    id: a.alias,
    alias: a.alias,
    name: a.title,
    subtitle: `${a.kind} · ${a.isActive ? "active" : "inactive"}`,
  };
}

registerMention(announcementMention);
