/**
 * Server-executed query tools.
 *
 * Unlike `apply*` tools which are client-side (the model emits the
 * input, the admin reviews and writes back to the form), these tools
 * have an `execute` that the AI SDK runs server-side. We dispatch to
 * each module's service singleton for the actual DB read.
 *
 * **organizationId** is closed over from the per-request execution
 * context (passed in by `service.streamChat`); we don't trust the
 * model to provide it.
 *
 * Naming differences across module services:
 *   - check-in:    listConfigs / getConfig
 *   - leaderboard: listConfigs / getConfig
 *   - mail:        listMessages / getMessage
 *   - announcement: list / getByAlias (no get-by-id, alias-only)
 *   - character:   listCharacters / getCharacter
 *   - banner:      listGroups / getGroup
 *   - activity:    listActivities / getActivity (+ getActivityAnalytics)
 *
 * The dispatcher table flattens these into uniform `(orgId, q, limit)`
 * and `(orgId, key)` calls. Modules NOT in the table return an
 * "unsupported" error message — extend the table as MVP grows.
 */

import { tool } from "ai";
import { z } from "zod";

import { activityService } from "../../activity";
import { announcementService } from "../../announcement";
import { bannerService } from "../../banner";
import { characterService } from "../../character";
import { checkInService } from "../../check-in";
import { leaderboardService } from "../../leaderboard";
import { mailService } from "../../mail";
import type { ChatExecutionContext } from "../types";

type ListFn = (
  orgId: string,
  q: string | undefined,
  limit: number,
) => Promise<{ items: unknown[]; nextCursor?: string | null }>;
type GetFn = (orgId: string, key: string) => Promise<unknown>;

const QUERY_DISPATCH: Record<string, { list?: ListFn; get?: GetFn }> = {
  "check-in": {
    list: (orgId, q, limit) => checkInService.listConfigs(orgId, { q, limit }),
    get: (orgId, key) => checkInService.getConfig(orgId, key),
  },
  "leaderboard": {
    list: (orgId, q, limit) =>
      leaderboardService.listConfigs(orgId, { q, limit }),
    get: (orgId, key) => leaderboardService.getConfig(orgId, key),
  },
  "mail": {
    list: (orgId, q, limit) => mailService.listMessages(orgId, { q, limit }),
    get: (orgId, key) => mailService.getMessage(orgId, key),
  },
  "announcement": {
    list: (orgId, q, limit) => announcementService.list(orgId, { q, limit }),
    // announcement only has getByAlias; describe by id isn't supported.
    get: (orgId, key) => announcementService.getByAlias(orgId, key),
  },
  "character": {
    list: (orgId, _q, limit) =>
      characterService.listCharacters(orgId, { limit }),
    get: (orgId, key) => characterService.getCharacter(orgId, key),
  },
  "banner": {
    list: (orgId, _q, limit) => bannerService.listGroups(orgId, { limit }),
    get: (orgId, key) => bannerService.getGroup(orgId, key),
  },
  "activity": {
    list: (orgId, q, limit) => activityService.listActivities(orgId, { q, limit }),
    get: (orgId, key) => activityService.getActivity(orgId, key),
  },
};

/**
 * Bilingual labels for the supported modules. Embedded in the tool's
 * `module` enum description so the model can reliably map Chinese
 * phrases (签到 / 排行榜 / 系统邮件 / 公告 / 角色 / Banner / 活动) to
 * the correct module ID without hallucinating new strings.
 *
 * The `z.enum([...])` constraint is the hard rule — model MUST pick one
 * of these. The descriptions below are the soft hint that helps it
 * choose correctly.
 */
const MODULE_LABELS: Record<string, string> = {
  "check-in": "签到 (check-in)",
  "leaderboard": "排行榜 (leaderboard)",
  "mail": "系统邮件 (mail)",
  "announcement": "公告 (announcement)",
  "character": "角色 (character)",
  "banner": "Banner / 轮播 (banner)",
  "activity": "活动 (activity)",
};

const QUERYABLE_MODULES = Object.keys(QUERY_DISPATCH) as [string, ...string[]];

const MODULE_ENUM_DESCRIPTION =
  "Pick one of: " +
  QUERYABLE_MODULES.map((m) => MODULE_LABELS[m] ?? m).join(", ");

export function createQueryTools(execCtx: ChatExecutionContext) {
  const orgId = execCtx.organizationId;

  return {
    queryModule: tool({
      description:
        "List configs/items in an admin module, optionally filtered by " +
        "name/alias. Use this to answer 'show me recent X' or 'find X with " +
        "name containing Y' questions. Returns up to `limit` items, " +
        "default 10.",
      inputSchema: z.object({
        // z.enum makes the model PICK from the list — it can't invent
        // a new module string. Description carries the bilingual map.
        module: z.enum(QUERYABLE_MODULES).describe(MODULE_ENUM_DESCRIPTION),
        query: z
          .string()
          .optional()
          .describe("Optional substring filter on name/alias."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Max items to return (1-50)."),
      }),
      execute: async ({ module, query, limit }) => {
        const entry = QUERY_DISPATCH[module];
        if (!entry?.list) {
          return {
            error: `Module "${module}" is not queryable yet. Supported: ${QUERYABLE_MODULES.join(", ")}.`,
          };
        }
        try {
          const page = await entry.list(orgId, query, limit);
          return {
            items: page.items,
            nextCursor: page.nextCursor ?? null,
            count: page.items.length,
          };
        } catch (err) {
          return {
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),

    describeConfig: tool({
      description:
        "Get full details of one config by id or alias. Use this when the " +
        "user asks for the configuration of a specific named/aliased item.",
      inputSchema: z.object({
        module: z.enum(QUERYABLE_MODULES).describe(MODULE_ENUM_DESCRIPTION),
        key: z.string().describe("Config id or alias."),
      }),
      execute: async ({ module, key }) => {
        const entry = QUERY_DISPATCH[module];
        if (!entry?.get) {
          return {
            error: `Module "${module}" doesn't support describe yet. Supported: ${QUERYABLE_MODULES.join(", ")}.`,
          };
        }
        try {
          return { config: await entry.get(orgId, key) };
        } catch (err) {
          return {
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),

    analyzeActivity: tool({
      description:
        "Get participation analytics for one activity by id or alias " +
        "(participants count, completion rate, milestones). Use only for " +
        "activity-related questions.",
      inputSchema: z.object({
        key: z.string().describe("Activity id or alias."),
      }),
      execute: async ({ key }) => {
        try {
          return {
            analytics: await activityService.getActivityAnalytics({
              organizationId: orgId,
              activityIdOrAlias: key,
            }),
          };
        } catch (err) {
          return {
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),
  };
}

export const QUERY_TOOL_NAMES = [
  "queryModule",
  "describeConfig",
  "analyzeActivity",
] as const;
