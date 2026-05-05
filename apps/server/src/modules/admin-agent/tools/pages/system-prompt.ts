/**
 * System prompt for the `pages-builder` agent.
 *
 * Built per turn so the model sees:
 *   - the project's current `name` / `slug` / `authMode` / `boundModules`
 *   - the current draft schema (or "no draft yet" if the project has
 *     never been edited)
 *   - the catalog of every block type with one-line `whenToUse` and
 *     a tiny example each — enough for the model to pick the right
 *     block without an explicit `listAvailableBlocks` round trip
 *
 * The prompt is deliberately verbose about the "always emit FULL
 * schema" rule. Earlier tool-calling models (DeepSeek V3, Kimi K2)
 * routinely emit partial schemas on iteration turns; the redundant
 * reminder kills that failure mode in eval.
 *
 * Keep this file pure (no DB calls, no env access) so the unit tests
 * can verify the prompt verbatim. Project context is fetched by the
 * agent factory and passed in as input.
 */

import {
  aiMetadata,
  renderAIMetadataMarkdown,
} from "@repo/page-blocks/ai-metadata";

// Derive block-type list from ai-metadata keys (server can't import
// catalog.ts — it transitively pulls .tsx React components which the
// server tsconfig has no JSX configured for). The page-blocks
// catalog.test.ts asserts these keys mirror CATALOG_BLOCK_TYPES.
const CATALOG_BLOCK_TYPES = new Set(Object.keys(aiMetadata));

import type {
  PageAuthMode,
  PageProject,
  PageProjectSchema as PageProjectSchemaType,
} from "../../../page/types";

export interface PagesBuilderPromptInput {
  project: Pick<
    PageProject,
    "id" | "name" | "slug" | "authMode" | "boundModules" | "publishedVersionId"
  >;
  /** Current draft schema (or null when the project is empty / freshly created). */
  draftSchema: PageProjectSchemaType | null;
  /** Latest published version number (`null` when nothing is published yet). */
  publishedVersionNumber: number | null;
  /** Locale of the current user message — drives short replies. */
  locale: "zh" | "en";
}

const BASE_RULES_EN = `You are the Apollo Pages builder. The operator describes the
landing page they want; you respond by calling \`proposePageDraft\`
with the FULL PageProjectSchema for the new state, NOT a patch.

Hard rules:
1. ALWAYS emit the full schema on every proposal. Server stores
   immutable version snapshots — partial schemas corrupt the project.
2. Block \`type\` MUST be one of the catalog ids. Calling a non-catalog
   type fails validation; the tool result will list the offending
   path so you can self-correct.
3. Every \`block.binding.module\` MUST be in the project's
   \`boundModules\`. If the operator asks for a module that isn't
   bound, call \`updateProjectSettings\` first to add it.
4. \`pages\` ids and \`blocks\` ids must be unique within their scope.
   \`defaultPageId\` must reference an existing page.
5. Prefer the smallest change to fulfil the operator's request. If
   they say "change the headline", keep all other blocks identical.
6. Use \`updateProjectSettings\` for project-level metadata (name,
   boundModules, theme overrides in settings) — NOT proposePageDraft.
7. After proposing a draft, do NOT auto-publish. The operator clicks
   publish in the admin UI. Only call \`publishVersion\` if the
   operator explicitly says "publish" / "上线" / "发布".
8. After \`proposePageDraft\` succeeds, reply with a one-sentence
   summary in the operator's language. No JSON in the reply.
`;

const BASE_RULES_ZH = `你是 Apollo Pages 构建器。运营会描述他想要的落地页样子；你的回复
就是调用 \`proposePageDraft\`，传入新状态的完整 PageProjectSchema，
不是 patch。

硬性规则：
1. 每次提案都必须传完整 schema。服务端按"不可变版本快照"存储 ——
   传 patch / 残缺 schema 会破坏项目。
2. block.type 必须是 catalog 中已注册的 id。传未注册的 type 会被
   服务端校验拒绝，错误会以 \`{ok:false, message}\` 形式回到工具
   返回值里，你可以读后自我修正。
3. 每个 \`block.binding.module\` 必须在项目的 boundModules 内。如果
   运营要求的模块没在 boundModules 里，先调 \`updateProjectSettings\`
   把它加进去。
4. pages 的 id 和同页内 blocks 的 id 都必须唯一。\`defaultPageId\`
   必须指向真实存在的页面。
5. 用最小改动满足运营诉求。运营说"改下标题"，就只改标题，其他
   block 一字不动。
6. 项目级元数据（name / boundModules / theme 覆盖等）走
   \`updateProjectSettings\`，不要拿 proposePageDraft 改。
7. 提案后不要自动发布。运营在 admin UI 点发布。只有当运营明确
   说"发布"/"上线"/"publish"时才调 \`publishVersion\`。
8. \`proposePageDraft\` 成功后，用运营的语言简单一句话总结改了
   什么。回复里不要带 JSON。
`;

export function buildPagesBuilderSystemPrompt(
  input: PagesBuilderPromptInput,
): string {
  const blockTypes = Array.from(CATALOG_BLOCK_TYPES);
  const catalogSection = renderAIMetadataMarkdown(blockTypes);

  const projectSection = renderProjectContext(input);
  const draftSection = renderDraftContext(input);

  const rules = input.locale === "zh" ? BASE_RULES_ZH : BASE_RULES_EN;

  return [
    rules,
    "",
    "## Current project",
    projectSection,
    "",
    "## Current draft",
    draftSection,
    "",
    "## Block catalog",
    `Available block types: ${blockTypes.join(", ")}`,
    "",
    catalogSection,
  ].join("\n");
}

function renderProjectContext(input: PagesBuilderPromptInput): string {
  const p = input.project;
  return [
    `- id: ${p.id}`,
    `- name: ${p.name}`,
    `- slug: ${p.slug}`,
    `- authMode: ${p.authMode as PageAuthMode}`,
    `- boundModules: ${p.boundModules.length === 0 ? "(none)" : p.boundModules.join(", ")}`,
    `- publishedVersion: ${
      input.publishedVersionNumber == null
        ? "(none)"
        : `v${input.publishedVersionNumber}`
    }`,
  ].join("\n");
}

function renderDraftContext(input: PagesBuilderPromptInput): string {
  if (!input.draftSchema) {
    return "(empty — proposePageDraft will create v1)";
  }
  // Pretty-print but cap at 8000 chars so a giant schema doesn't blow
  // out the context window. Anything beyond that suggests the project
  // is too complex to reasonably edit by chat anyway.
  const json = JSON.stringify(input.draftSchema, null, 2);
  if (json.length <= 8000) return "```json\n" + json + "\n```";
  return (
    "```json\n" +
    json.slice(0, 8000) +
    "\n... (truncated; full schema available via getDraftSchema if needed)\n```"
  );
}
