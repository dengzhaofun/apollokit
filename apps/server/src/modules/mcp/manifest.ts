/**
 * Static manifest of documented modules.
 *
 * Mirrors `apps/admin/content/docs/{zh,en}/meta.json` — extracted at
 * authoring time so the MCP `list_doc_modules` tool can answer
 * "what does ApolloKit support?" without a cross-worker fetch.
 *
 * The two locales share the same module slugs; only section labels
 * differ. If a doc page is renamed/added in admin's meta.json,
 * update this file in the same PR.
 *
 * Excluded on purpose:
 *   - `index` / `quickstart` / `authentication` / `projects` / `errors`
 *     — meta pages, not modules.
 *   - `api` — generated OpenAPI reference, browse via /openapi.json.
 *   - section dividers (`---Economy---` etc.) — captured as `section`.
 */

export type DocModuleSection =
  | "economy"
  | "live-ops"
  | "social"
  | "content"
  | "system"
  | "integration";

export type DocModuleEntry = {
  /** kebab-case slug; matches the file name under content/docs/<locale>/<slug>.mdx */
  slug: string;
  section: DocModuleSection;
  /** human label in zh + en */
  label: { zh: string; en: string };
};

export const SECTION_LABELS: Record<
  DocModuleSection,
  { zh: string; en: string }
> = {
  economy: { zh: "经济", en: "Economy" },
  "live-ops": { zh: "运营", en: "Live Ops" },
  social: { zh: "社交", en: "Social" },
  content: { zh: "内容", en: "Content" },
  system: { zh: "系统", en: "System" },
  integration: { zh: "集成", en: "Integration" },
};

export const DOC_MODULES: readonly DocModuleEntry[] = [
  // Economy
  { slug: "item", section: "economy", label: { zh: "物品", en: "Items" } },
  {
    slug: "currency",
    section: "economy",
    label: { zh: "货币", en: "Currency" },
  },
  {
    slug: "exchange",
    section: "economy",
    label: { zh: "兑换", en: "Exchange" },
  },
  { slug: "shop", section: "economy", label: { zh: "商城", en: "Shop" } },
  { slug: "mail", section: "economy", label: { zh: "邮件", en: "Mail" } },
  { slug: "cdkey", section: "economy", label: { zh: "兑换码", en: "CD Key" } },
  {
    slug: "storage-box",
    section: "economy",
    label: { zh: "仓库", en: "Storage Box" },
  },
  // Live Ops
  {
    slug: "check-in",
    section: "live-ops",
    label: { zh: "签到", en: "Check-in" },
  },
  {
    slug: "activity",
    section: "live-ops",
    label: { zh: "活动", en: "Activities" },
  },
  {
    slug: "lottery",
    section: "live-ops",
    label: { zh: "抽奖", en: "Lottery" },
  },
  { slug: "task", section: "live-ops", label: { zh: "任务", en: "Tasks" } },
  {
    slug: "announcement",
    section: "live-ops",
    label: { zh: "公告", en: "Announcements" },
  },
  {
    slug: "banner",
    section: "live-ops",
    label: { zh: "横幅", en: "Banners" },
  },
  // Social
  { slug: "friend", section: "social", label: { zh: "好友", en: "Friends" } },
  {
    slug: "friend-gift",
    section: "social",
    label: { zh: "好友赠送", en: "Friend Gifts" },
  },
  { slug: "guild", section: "social", label: { zh: "工会", en: "Guilds" } },
  { slug: "team", section: "social", label: { zh: "队伍", en: "Teams" } },
  { slug: "invite", section: "social", label: { zh: "邀请", en: "Invites" } },
  {
    slug: "leaderboard",
    section: "social",
    label: { zh: "排行榜", en: "Leaderboards" },
  },
  { slug: "rank", section: "social", label: { zh: "段位", en: "Ranks" } },
  // Content
  {
    slug: "collection",
    section: "content",
    label: { zh: "收藏", en: "Collections" },
  },
  {
    slug: "dialogue",
    section: "content",
    label: { zh: "对话", en: "Dialogues" },
  },
  {
    slug: "entity",
    section: "content",
    label: { zh: "实体", en: "Entities" },
  },
  { slug: "level", section: "content", label: { zh: "等级", en: "Levels" } },
  { slug: "link", section: "content", label: { zh: "链接", en: "Links" } },
  {
    slug: "media-library",
    section: "content",
    label: { zh: "媒体库", en: "Media Library" },
  },
  // System
  {
    slug: "end-user",
    section: "system",
    label: { zh: "玩家账号", en: "End Users" },
  },
  {
    slug: "analytics",
    section: "system",
    label: { zh: "数据分析", en: "Analytics" },
  },
  // Integration
  {
    slug: "webhooks",
    section: "integration",
    label: { zh: "Webhook", en: "Webhooks" },
  },
  { slug: "sdk", section: "integration", label: { zh: "SDK", en: "SDK" } },
] as const;
