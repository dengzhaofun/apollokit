/**
 * Inject `x-codeSamples` into every operation in `apps/server/openapi.json`.
 *
 * `x-codeSamples` is the de-facto OpenAPI extension (originally Redoc,
 * supported by fumadocs-openapi 16.8+) that lets API reference pages
 * render multi-language code Tabs alongside each endpoint. The fumadocs
 * `<APIPage>` component (wired in `apps/admin/src/lib/openapi.tsx`)
 * picks them up automatically — no UI changes here.
 *
 * Snippets per operation:
 *   - `lang: shell` — curl, with the right auth headers per audience
 *   - `lang: ts`    — `@apollokit/server` (admin) or `@apollokit/client`
 *                     (client) usage with the generated function name
 *
 * The TS function name is derived from the operationId by snake → camel
 * conversion. operationId is set by `apps/server/src/lib/openapi.ts`
 * `operationIdFromRoute` as `${tagSlug}_${method}_${pathSlug}`, e.g.
 * `announcement_admin_get_root` → `announcementAdminGetRoot`. The same
 * conversion happens inside @hey-api/openapi-ts when it generates
 * `packages/sdk-{server,client}-ts/src/generated/sdk.gen.ts`, so the
 * names line up by construction. If a server operation lacks an
 * operationId we leave it alone (no SDK function is generated either).
 *
 * Python / Go SDKs aren't shipped yet — when they land (plan stage 3),
 * extend `LANG_BUILDERS` here to emit those snippets too. The fumadocs
 * Tab UI tolerates missing langs per operation.
 *
 * This script mutates `apps/server/openapi.json` in place. The dump
 * pipeline in `apps/server/scripts/dump-openapi.sh` is the upstream
 * source — re-running dump always overwrites these samples, so
 * inject-samples must run *after* dump in the SDK build pipeline (see
 * `turbo.json` task `sdks:generate`).
 *
 * Usage: `tsx scripts/inject-samples.ts`
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Snapshot lives in apps/server/openapi.json (fumadocs source-of-truth).
// inject-samples writes back into the same file.
const targetPath = resolve(
  __dirname,
  "../../../apps/server/openapi.json",
);
const PLACEHOLDER_BASE_URL = "https://api.example.com";

// ---------------------------------------------------------------------------
// Types — minimal OpenAPI 3.1 subset
// ---------------------------------------------------------------------------

interface CodeSample {
  lang: string;
  label: string;
  source: string;
}

interface Operation {
  operationId?: string;
  tags?: string[];
  parameters?: Array<{ in: string; name: string; required?: boolean }>;
  requestBody?: { content?: Record<string, unknown> };
  "x-codeSamples"?: CodeSample[];
}

interface OpenAPISpec {
  paths: Record<string, Record<string, Operation | unknown>>;
}

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
]);

// ---------------------------------------------------------------------------
// Audience classifier — decides which SDK + auth headers to emit
// ---------------------------------------------------------------------------

type Audience = "client" | "admin" | "public";

function classify(path: string): Audience {
  // /api/client/* are end-user-scoped routes. /api/client/auth/* is
  // Better Auth's player-facing instance and isn't registered by
  // OpenAPIHono — won't appear here, but the prefix check catches it
  // in case the spec ever ingests it.
  if (path.startsWith("/api/client/")) return "client";
  // /health, / etc. — usually no `security` declaration. Still emit
  // a curl snippet so the docs page has *something*.
  if (path === "/" || path === "/health") return "public";
  return "admin";
}

// ---------------------------------------------------------------------------
// snake_case operationId → camelCase SDK function name
// ---------------------------------------------------------------------------

function snakeToCamel(snake: string): string {
  const parts = snake.split("_").filter(Boolean);
  if (parts.length === 0) return snake;
  return parts
    .map((p, i) =>
      i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Path placeholder substitution for curl
// ---------------------------------------------------------------------------

/**
 * Replace `{id}`, `{key}` etc. with literal placeholders so the curl
 * snippet copy-pastes into a shell as a meaningful template. We don't
 * read parameter examples from the spec because most routes don't set
 * them — the placeholder hint is more useful than a missing value.
 */
function fillPathParams(path: string): string {
  return path.replace(/\{([^}]+)\}/g, "<$1>");
}

// ---------------------------------------------------------------------------
// Snippet builders
// ---------------------------------------------------------------------------

function buildCurl(method: string, path: string, audience: Audience): string {
  const url = `${PLACEHOLDER_BASE_URL}${fillPathParams(path)}`;
  const upper = method.toUpperCase();
  const lines = [`curl -X ${upper} '${url}'`];
  if (audience === "admin") {
    lines.push(`  -H 'x-api-key: ak_…'`);
  } else if (audience === "client") {
    lines.push(`  -H 'x-api-key: cpk_…'`);
    lines.push(`  -H 'x-end-user-id: <end-user-id>'`);
    lines.push(`  -H 'x-user-hash: <hmac-sha256(end-user-id, csk)>'`);
  }
  // Public: no auth headers
  if (upper === "POST" || upper === "PUT" || upper === "PATCH") {
    lines.push(`  -H 'Content-Type: application/json'`);
    lines.push(`  -d '{ /* request body */ }'`);
  }
  return lines.join(" \\\n");
}

function buildTsAdmin(fnName: string): string {
  return [
    `import {`,
    `  createServerClient,`,
    `  ${fnName},`,
    `} from "@apollokit/server";`,
    ``,
    `createServerClient({`,
    `  baseUrl: "${PLACEHOLDER_BASE_URL}",`,
    `  apiKey: process.env.APOLLOKIT_ADMIN_KEY!, // "ak_…"`,
    `});`,
    ``,
    `const { data } = await ${fnName}({ throwOnError: true });`,
    `console.log(data[200].data);`,
  ].join("\n");
}

function buildTsClient(fnName: string): string {
  return [
    `import { createClient, ${fnName} } from "@apollokit/client";`,
    ``,
    `// Server-side mode (Node) — pass csk_ so the SDK signs requests.`,
    `// Browser code receives a pre-signed userHash from your backend.`,
    `createClient({`,
    `  baseUrl: "${PLACEHOLDER_BASE_URL}",`,
    `  publishableKey: "cpk_…",`,
    `  secret: process.env.APOLLOKIT_CSK!,`,
    `});`,
    ``,
    `const { data } = await ${fnName}({`,
    `  headers: { "x-end-user-id": "<end-user-id>" },`,
    `  throwOnError: true,`,
    `});`,
    `console.log(data[200].data);`,
  ].join("\n");
}

function buildSamples(
  method: string,
  path: string,
  operationId: string | undefined,
  audience: Audience,
): CodeSample[] {
  const samples: CodeSample[] = [
    {
      lang: "shell",
      label: "curl",
      source: buildCurl(method, path, audience),
    },
  ];
  // TS samples need a stable function name — derive from operationId.
  // Public endpoints (no operationId in some cases, or no SDK function
  // generated) get a curl-only Tab.
  if (operationId && audience !== "public") {
    const fnName = snakeToCamel(operationId);
    samples.push({
      lang: "ts",
      label:
        audience === "client"
          ? "TypeScript (@apollokit/client)"
          : "TypeScript (@apollokit/server)",
      source: audience === "client" ? buildTsClient(fnName) : buildTsAdmin(fnName),
    });
  }
  return samples;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const raw = readFileSync(targetPath, "utf-8");
  const spec = JSON.parse(raw) as OpenAPISpec;

  let touched = 0;
  let skipped = 0;
  for (const [path, methods] of Object.entries(spec.paths)) {
    if (methods === null || typeof methods !== "object") continue;
    const audience = classify(path);
    for (const [method, op] of Object.entries(methods)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      if (op === null || typeof op !== "object") continue;
      const operation = op as Operation;
      const samples = buildSamples(
        method,
        path,
        operation.operationId,
        audience,
      );
      if (samples.length === 0) {
        skipped += 1;
        continue;
      }
      operation["x-codeSamples"] = samples;
      touched += 1;
    }
  }

  // Match dump-openapi.sh's 2-space indent (`JSON.stringify(doc, null, 2)`)
  // so re-running dump after this script produces no whitespace-only
  // diff noise — only the `x-codeSamples` additions show up in PRs.
  writeFileSync(targetPath, JSON.stringify(spec, null, 2) + "\n");
  console.log(
    `inject-samples: wrote ${touched} operations (skipped ${skipped}) → ${targetPath}`,
  );
}

main();
