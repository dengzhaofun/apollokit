/**
 * Generate fumadocs API reference MDX from the server's OpenAPI snapshot.
 *
 * Reads `apps/server/openapi.json` (committed snapshot, kept fresh via
 * `pnpm --filter=server openapi:dump` whenever the API surface changes)
 * and writes one MDX page per operation under
 * `content/docs/zh/api/` plus a `meta.json` per tag-folder so the
 * fumadocs sidebar groups operations by tag.
 *
 * Only the Chinese locale gets real MDX. The English locale ships a
 * single hand-written `content/docs/en/api.mdx` stub that links over
 * to /docs/zh/api. We tried both (a) duplicating MDX into `en/api/`
 * and (b) symlinking `en/api → ../zh/api`. Both stalled the dev server
 * — vite + cloudflare-vite-plugin choke on the doubled file count or
 * the symlink walk. The stub keeps en sidebar discoverable without
 * paying that cost; switch to a second `generateForLocale("en", enDoc)`
 * pass when the spec gains real translations.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Document } from "fumadocs-openapi";
import { generateFiles } from "fumadocs-openapi";
import { createOpenAPI } from "fumadocs-openapi/server";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const SCHEMA_PATH = join(repoRoot, "apps/server/openapi.json");

interface LocaleConfig {
  /** Folder under `content/docs/<locale>/api/`. */
  locale: "zh" | "en";
  /** Display name for the API folder in the sidebar. */
  folderTitle: string;
  /** Frontmatter title for the landing page. */
  indexTitle: string;
  /** Body of the landing MDX. `${opCount}` etc. are interpolated by the caller. */
  indexBody: (vars: {
    opCount: number;
    tagCount: number;
    schemaCount: number;
    title: string;
    version: string;
  }) => string;
}

const LOCALES: LocaleConfig[] = [
  {
    locale: "zh",
    // 注意:这个 folderTitle 写进 zh/api/meta.json,en locale 没有自己
    // 的 api/ 目录,fumadocs i18n 会回退到 zh 的同名目录拿 title。
    // 所以这里必须用对中英用户都自然的字眼,不能写"API 参考",否则
    // en sidebar 会冒出中文。
    folderTitle: "API",
    // 同 folderTitle:zh 的 index.mdx 也被 en fallback 读到,所以
    // title 也用通用词。页面 body 保留中文,Chinese 读者只是页头
    // 看到 "API Overview" 而已。
    indexTitle: "API Overview",
    indexBody: ({ opCount, tagCount, schemaCount, title, version }) => `本节由 \`pnpm --filter=admin gen:api-docs\` 从 \`apps/server/openapi.json\` 自动生成 — 请勿手动编辑这些 MDX。

| 指标 | 数量 |
| --- | ---: |
| Operations | ${opCount} |
| Tags（左侧分组） | ${tagCount} |
| Schemas | ${schemaCount} |

> ${title} v${version}

## 鉴权速览

- **Admin** 路由（\`/api/<module>/...\`）：Better Auth session cookie 或 \`Authorization: Bearer ak_…\`
- **Client** 路由（\`/api/client/<module>/...\`）：\`X-Client-Public-Key: cpk_…\` + HMAC（\`X-Client-Signature\` / \`X-Client-Timestamp\` / \`X-Client-Nonce\`）

## 怎么用

1. 在左侧 sidebar 找到对应模块（每个 \`tag\` 一个分组）。
2. 进入具体 operation：
   - 顶部 playground 输入参数，点击 **Send** 直接试调；
   - **Authorization** 区显示需要哪种凭证；
   - 下方 **Response Body** 列出每个状态码（200/400/401/404/409）的 schema 与示例；
   - 多语言代码示例（cURL/JavaScript/Go/Python/Java/C#）随选随复制。

> 想要原始 spec？\`pnpm --filter=server openapi:dump\` 后看 [apps/server/openapi.json](https://github.com/dengzhaofun/apollokit/blob/main/apps/server/openapi.json)。`,
  },
];

/**
 * Logical name for the schema in fumadocs's registry. Generated MDX writes
 * this string into `<APIPage document="…" />`, and the matching runtime
 * `createOpenAPI({ input: () => ({ [SCHEMA_KEY]: doc }) })` in
 * `src/lib/openapi.ts` resolves it. Using a logical name (not a file path)
 * keeps generated MDX portable across dev machines and survives the build
 * landing in a Cloudflare Worker where the original fs path is gone.
 */
const SCHEMA_KEY = "apollokit";

async function main() {
  const schemaJson = await readFile(SCHEMA_PATH, "utf8");
  const schemaDoc = JSON.parse(schemaJson);

  for (const cfg of LOCALES) {
    await generateForLocale(cfg, schemaDoc);
  }
  // English locale doesn't get auto-generated MDX. The spec's
  // descriptions are not bilingual, and doubling the file count to ~900
  // overwhelms vite/cloudflare-vite-plugin. Instead, a hand-written
  // `content/docs/en/api.mdx` stub points users to /docs/zh/api. When
  // the spec gains real translations, add `en` back to LOCALES and
  // delete the stub.
}

async function generateForLocale(cfg: LocaleConfig, schemaDoc: OpenAPIDoc) {
  const outputDir = join(here, `../content/docs/${cfg.locale}/api`);

  // Fresh-rebuild every run. Stale ops would otherwise stick around as
  // ghost MDX files after they're removed from the spec.
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const openapi = createOpenAPI({
    // fumadocs' SchemaMap expects the full OpenAPIV3_2.Document shape. Our
    // local OpenAPIDoc is a narrower read-only view used only for folder
    // grouping; the runtime JSON we just loaded is actually a full spec.
    input: () => ({ [SCHEMA_KEY]: schemaDoc as unknown as Document }),
    // No proxy needed for now — the playground will hit the API directly
    // once we add `playground.proxy` config in source-server.ts. Wire that
    // when we add a /api/openapi-proxy server route in admin.
  });

  await generateFiles({
    input: openapi,
    output: outputDir,
    per: "operation",
    // Custom group derivation. `groupBy: "tag"` produces 86 flat folders
    // ("Lottery Pools", "Lottery Tiers", …) — visually noisy, no module
    // hierarchy. We instead derive `Module/Sub` paths from the tag, so
    // related tags collapse into a single expandable parent folder
    // ("Lottery" → Pools/Tiers/Prizes/Pity Rules/Pull/Client).
    //
    // The longest-prefix module list mirrors the directories under
    // `apps/server/src/modules/` plus our naming convention. Tags that
    // don't match any module fall back to a flat folder named after the
    // tag itself.
    groupBy: (entry) => groupForEntry(entry, schemaDoc),
    // Auto-generate `meta.json` per folder so the fumadocs sidebar
    // collapses operations under their tag with stable ordering.
    meta: true,
  });

  // Without an `index.mdx`, fumadocs treats `/docs/<locale>/api` as a
  // missing page. The sidebar's "OpenAPI" entry needs a real landing
  // target, so we emit a static introduction page here and prepend it to
  // the top-level `meta.json` so it shows up first in the sidebar.
  await writeIndexPage(cfg, outputDir, schemaDoc);

  // fumadocs writes `meta.json` at every leaf folder with `title` set to
  // the group display name from `groupBy(...)`. Since we returned
  // path-like strings ("Lottery/Pools"), every leaf meta.json ends up
  // with `"title": "Lottery/Pools"`, which renders awkwardly in the
  // sidebar. Walk every meta.json under the API tree and rewrite titles
  // to the last segment.
  await polishLeafMetas(outputDir);

  console.log(`Generated ${cfg.locale} API docs into ${outputDir}`);
}

interface OpenAPIDoc {
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, { tags?: string[] }>>;
  tags?: Array<{ name: string }>;
  components?: { schemas?: Record<string, unknown> };
}

// ─── Module-prefix grouping ──────────────────────────────────────
// Two-word module names MUST come before single-word ones so the
// longest-match wins ("Storage Box" beats "Storage" — though we don't
// have a "Storage" module, the principle matters when adding new ones).
const MODULES = [
  "Storage Box",
  "Friend Gift",
  "Check-In",
  "End User",
  "Client Credentials",
  "Event Catalog",
  "Media Library",
  "Assist Pool",
  "Activity",
  "Analytics",
  "Announcement",
  "Banner",
  "CDKey",
  "Collection",
  "Currency",
  "Dialogue",
  "Entity",
  "Exchange",
  "Friend",
  "Guild",
  "Invite",
  "Item",
  "Leaderboard",
  "Level",
  "Lottery",
  "Mail",
  "Rank",
  "Shop",
  "Task",
  "Team",
];

/**
 * Map a tag string to a slash-separated `Module/Sub` group path. The
 * fumadocs default `slugify` keeps "/" intact, so this becomes a real
 * nested directory path.
 *
 *   "Lottery Pools"          → "Lottery/Pools"
 *   "Lottery (Client)"       → "Lottery/Client"
 *   "Activity"               → "Activity"
 *   "End User"               → "End User"
 *   "Entity Schemas (Admin)" → "Entity/Schemas"  ((Admin) suffix dropped
 *                                                 — admin-only is implicit
 *                                                 when there's no client
 *                                                 counterpart at this
 *                                                 sub-level)
 */
function tagToFolder(tag: string): string {
  for (const m of MODULES) {
    if (tag === m) return m;
    if (tag.startsWith(m + " ")) {
      let leaf = tag.slice(m.length).trim();
      // "(Client)" / "(Admin)" alone → "Client" / "Admin"
      const wholeParen = /^\((.+)\)$/.exec(leaf);
      if (wholeParen) {
        leaf = wholeParen[1];
      } else {
        // "Schemas (Admin)" → "Schemas" (drop noisy admin-only marker)
        leaf = leaf.replace(/\s*\(Admin\)\s*$/i, "").trim();
      }
      return `${m}/${leaf}`;
    }
  }
  return tag;
}

function groupForEntry(
  entry: { type: string; item: { method: string; path?: string } },
  doc: OpenAPIDoc,
): string {
  // Our spec exposes no webhooks, so operation is the only case we care
  // about. Guard anyway — fumadocs narrows `entry` to operation|webhook and
  // webhook.item has no `path`.
  if (entry.type !== "operation" || !entry.item.path) return "Misc";
  const op = doc.paths?.[entry.item.path]?.[entry.item.method.toLowerCase()];
  const tag = op?.tags?.[0] ?? "Misc";
  return tagToFolder(tag);
}

async function writeIndexPage(
  cfg: LocaleConfig,
  outputDir: string,
  doc: OpenAPIDoc,
) {
  const opCount = Object.values(doc.paths ?? {}).reduce(
    (sum, ops) => sum + Object.keys(ops).length,
    0,
  );
  const tagCount = doc.tags?.length ?? 0;
  const schemaCount = Object.keys(doc.components?.schemas ?? {}).length;
  const title = doc.info?.title ?? "API Reference";
  const version = doc.info?.version ?? "0.0.0";

  const body = cfg.indexBody({
    opCount,
    tagCount,
    schemaCount,
    title,
    version,
  });

  const mdx = `---
title: ${cfg.indexTitle}
description: ${title} v${version}
---

${body}
`;

  await writeFile(`${outputDir}/index.mdx`, mdx);

  // Rewrite the top-level meta.json:
  // - `title` so the sidebar folder shows "API 参考" (otherwise fumadocs
  //   auto-titles it "Api" from the directory name).
  // - `defaultOpen: true` so the user lands with the module groups
  //   expanded.
  // - `pages` lists immediate children only (parent folder names like
  //   "lottery", "shop") — not nested paths like "lottery/pools" that
  //   fumadocs's auto-output put there. The leaf operations are reached
  //   via each parent folder's own meta.json (written by polishLeafMetas).
  const { readdir, stat } = await import("node:fs/promises");
  const topLevel: string[] = [];
  for (const name of await readdir(outputDir)) {
    if (name === "meta.json" || name === "index.mdx") continue;
    const s = await stat(`${outputDir}/${name}`);
    if (s.isDirectory()) topLevel.push(name);
    else if (name.endsWith(".mdx")) topLevel.push(name.slice(0, -".mdx".length));
  }
  topLevel.sort();
  const meta = {
    title: cfg.folderTitle,
    defaultOpen: true,
    pages: ["index", ...topLevel],
  };
  await writeFile(`${outputDir}/meta.json`, JSON.stringify(meta, null, 2) + "\n");
}

/**
 * fumadocs-openapi writes meta.json only at the leaf folder where MDX
 * lives, and bakes the full slash-separated group path into the root
 * meta's `pages` (e.g. `"lottery/pools"`). fumadocs's source loader
 * expects each meta.json's `pages` to list **immediate children** —
 * names of files or folders at the same level. So we rebuild:
 *
 * - Root `api/meta.json`:
 *     pages = ["index", ...top-level folder names...]
 * - Every intermediate folder (`lottery/`, `entity/`, etc.):
 *     emit a fresh meta.json with pages = sorted child folder names
 *     (these don't exist by default — fumadocs would auto-discover, but
 *     ordering would be filesystem-dependent and unstable).
 * - Every leaf meta.json (`lottery/pools/meta.json`):
 *     keep the auto-generated `pages` list (it's the operation files in
 *     the right order), just rewrite `title` from "Lottery/Pools" to
 *     "Pools" so the sidebar reads cleanly.
 */
async function polishLeafMetas(outputDir: string) {
  const { readdir, stat } = await import("node:fs/promises");

  async function listKids(dir: string) {
    const names = await readdir(dir);
    const kids: string[] = [];
    for (const name of names) {
      if (name === "meta.json") continue;
      const s = await stat(`${dir}/${name}`);
      if (s.isDirectory()) kids.push(name);
      else if (name.endsWith(".mdx")) kids.push(name.slice(0, -".mdx".length));
    }
    return kids.sort();
  }

  async function walk(dir: string, isRoot: boolean): Promise<void> {
    const subdirs: string[] = [];
    for (const name of await readdir(dir)) {
      const s = await stat(`${dir}/${name}`);
      if (s.isDirectory()) subdirs.push(name);
    }
    for (const sub of subdirs) await walk(`${dir}/${sub}`, false);

    if (isRoot) return; // root meta.json is owned by writeIndexPage

    const metaPath = `${dir}/meta.json`;
    const folderName = dir.split("/").pop()!;
    const fallbackTitle = folderName
      .split(/[-_]/)
      .map((w) => w[0]?.toUpperCase() + w.slice(1))
      .join(" ");

    let existing: { title?: string; pages?: string[] } | null = null;
    try {
      existing = JSON.parse(await readFile(metaPath, "utf8"));
    } catch {
      // no meta.json yet — fumadocs only writes them at leaves, so this
      // is the parent-folder case (lottery/, entity/, …).
    }

    const meta = {
      title:
        existing?.title?.includes("/") || !existing?.title
          ? fallbackTitle
          : existing.title,
      pages: existing?.pages ?? (await listKids(dir)),
    };
    await writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n");
  }

  await walk(outputDir, true);
}

await main();
