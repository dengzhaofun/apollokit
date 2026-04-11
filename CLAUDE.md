# apollokit

pnpm + Turborepo monorepo. Package manager: `pnpm@9.0.0`. Node `>=18`.

## Layout

```
apps/
  web/     Next.js 16.2 app (React 19.2), dev port 3000
  docs/    Next.js 16.2 app (React 19.2), dev port 3001
  server/  Hono API on Cloudflare Workers (wrangler 4)
packages/
  ui/               @repo/ui — shared React components (button, card, code).
                    Exports source via "./*": "./src/*.tsx" (no build step).
  eslint-config/    @repo/eslint-config — entries: ./base, ./next-js, ./react-internal
  typescript-config/@repo/typescript-config — shared tsconfig bases
```

`pnpm-workspace.yaml` globs `apps/*` and `packages/*`. Internal packages are consumed via `workspace:*`.

## Commands

Run from repo root:

- `pnpm dev` — turbo runs `dev` in every app with a `dev` script (persistent, not cached).
- `pnpm build` — turbo runs `build` across the graph. **`apps/server` has no `build` script** — it deploys via wrangler, not turbo.
- `pnpm lint` — turbo `lint`. `apps/server` and `packages/typescript-config` have no lint script.
- `pnpm check-types` — turbo `check-types`. Next apps run `next typegen && tsc --noEmit`. `apps/server` has no check-types script.
- `pnpm format` — prettier on `**/*.{ts,tsx,md}` (run at root, NOT via turbo).

Filter a single workspace: `pnpm turbo <task> --filter=web` (or `docs`, `@repo/ui`, …).

Server-specific (run inside `apps/server` or with `--filter=server`):
- `pnpm dev` → `wrangler dev`
- `pnpm deploy` → `wrangler deploy --minify`
- `pnpm cf-typegen` → regenerates `CloudflareBindings` types from `wrangler.jsonc`

## Conventions

- All workspaces are `"type": "module"`.
- TypeScript everywhere (`typescript@5.9.2` pinned at root).
- ESLint 9 flat config (`eslint.config.js` / `.mjs` per package), `--max-warnings 0`.
- `@repo/ui` ships `.tsx` source directly — consumers transpile it. No dist, no build step for ui.
- Next apps share `@repo/eslint-config/next-js` and tsconfig from `@repo/typescript-config`.
- Cloudflare Worker compatibility date: `2026-04-11` (see `apps/server/wrangler.jsonc`). Uncomment bindings blocks there when adding KV / R2 / D1 / AI.

## Gotchas

- Adding a new task to `turbo.json`? Only `build`, `lint`, `check-types`, `dev` are currently defined. `format` is intentionally outside turbo.
- `apps/server` is a Worker, not a Node app — no Next/React, and Node built-ins require `nodejs_compat` compatibility flag (currently commented out).
- When adding a shared package, give it a `@repo/*` name and reference it as `"@repo/foo": "workspace:*"`.
