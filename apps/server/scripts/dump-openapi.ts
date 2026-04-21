/**
 * Dump the server's OpenAPI spec to `packages/sdk-core/specs/openapi.json`.
 *
 * Why esbuild instead of plain `tsx`:
 *   Wrangler and vitest both use bundler-style module resolution, which
 *   tolerates circular imports via live bindings (e.g. lottery/index.ts
 *   reading itemService during the same top-level evaluation wave).
 *   Node's native ESM loader enforces strict TDZ and crashes with
 *   `Cannot access 'itemService' before initialization`. Bundling with
 *   esbuild collapses the graph into a single wave — same strategy
 *   wrangler uses in production.
 *
 *   It also lets us alias the `cloudflare:workers` virtual module to the
 *   existing test shim (`src/testing/cloudflare-workers-shim.ts`) without
 *   installing a Node-level loader hook.
 *
 * The server's routes call into DB / auth only at request time. The
 * `/openapi.json` endpoint is pure route-definition serialization and
 * never touches Postgres — so the placeholder env values below are
 * sufficient for module-load.
 *
 * Run via `pnpm --filter=server openapi:dump`.
 *
 * KNOWN BLOCKER (as of 2026-04-21):
 *   `app.getOpenAPI31Document(...)` currently throws
 *   `RangeError: Maximum call stack size exceeded` inside
 *   `@asteasolutions/zod-to-openapi@8.5.0`'s `isOptionalSchema` /
 *   `isNullableSchema` helpers, triggered by two recursive zod schemas:
 *     - modules/level/validators.ts  → UnlockRuleSchema (z.lazy + all/any)
 *     - modules/shop/validators.ts   → ShopCategoryTreeNodeSchema (z.lazy + children)
 *   Those helpers call `.safeParse(undefined)`, which in zod 4 tries to
 *   stringify the schema `def` into the error message — the lazy-proxy
 *   loop overflows the stack. Upstream fix-or-flat strategy is tracked
 *   separately; once resolved this script produces the full spec
 *   unchanged.
 */
import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Placeholder env — real values come from wrangler/vitest in those runners.
process.env.DATABASE_URL ??= 'postgresql://dump:dump@localhost:5432/dump';
process.env.BETTER_AUTH_SECRET ??= 'x'.repeat(32);
process.env.BETTER_AUTH_URL ??= 'http://localhost:8787';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '..');
const shimAbs = resolve(serverRoot, 'src/testing/cloudflare-workers-shim.ts');
const entry = resolve(serverRoot, 'src/index.ts');
const outPath = resolve(
  serverRoot,
  '../../packages/sdk-core/specs/openapi.json',
);

// Bundle must live inside apps/server so Node's ESM resolver can find the
// externalized packages via the workspace's node_modules.
const tmp = resolve(serverRoot, '.openapi-dump');
mkdirSync(tmp, { recursive: true });
const bundle = resolve(tmp, 'bundle.mjs');

try {
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: bundle,
    logLevel: 'error',
    // Keep node built-ins external. Everything in node_modules/
    // is also external to avoid bundling drizzle/better-auth/etc —
    // they work fine under Node's own loader once the app entrypoint
    // resolves them through conventional paths.
    packages: 'external',
    plugins: [
      {
        name: 'cloudflare-workers-shim',
        setup(b) {
          b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
            path: shimAbs,
          }));
        },
      },
    ],
  });

  const { default: app } = await import(pathToFileURL(bundle).href);
  // Call the doc generator directly instead of going through the HTTP
  // layer — bypasses global middleware (logger, request-id, CORS,
  // secureHeaders) that would otherwise need real bindings. The HTTP
  // response also empty-bodies on error, which hides stack traces.
  const spec = app.getOpenAPI31Document({
    openapi: '3.1.0',
    info: { title: 'apollokit API', version: '0.1.0' },
    servers: [{ url: 'http://localhost:8787', description: 'Dev' }],
  }) as { paths: Record<string, unknown> };
  const pathCount = Object.keys(spec.paths ?? {}).length;

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(spec, null, 2) + '\n');
  console.log(`Wrote ${outPath} (${pathCount} paths)`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
