# apollokit

pnpm + Turborepo monorepo for a game SaaS platform. Package manager: `pnpm@9.0.0`. Node `>=18`.

See `AGENTS.md` at the repo root for the full project context, scaffold history, env vars, deploy notes, and the TanStack Intent skill mappings.

## Layout

```
apps/
  admin/   TanStack Start (Vite 7 + React 19.2 + Tailwind v4), dev port 3000
           Marketing site + authenticated dashboard. Deploys to Cloudflare Workers.
  server/  Hono API on Cloudflare Workers (wrangler 4.70+)
           Better Auth + Drizzle + Neon Postgres. Deploys via wrangler.
packages/
  ui/               @repo/ui — shared React components.
                    Exports source via "./*": "./src/*.tsx" (no build step).
                    Not currently consumed by admin; reserved for future shared UI.
  eslint-config/    @repo/eslint-config — entries: ./base, ./next-js, ./react-internal
  typescript-config/@repo/typescript-config — shared tsconfig bases
```

`pnpm-workspace.yaml` globs `apps/*` and `packages/*`. Internal packages are consumed via `workspace:*`.

`apps/web` and `apps/docs` were the default `create-turbo` template scaffolds — removed in commit `b3830b6` because they had no business code and existed only as placeholders.

## Commands

Run from repo root:

- `pnpm dev` — turbo runs `dev` in every app with a `dev` script (persistent, not cached). Brings up admin (3000) and server (wrangler 8787) in parallel.
- `pnpm build` — turbo `build` across the graph. `apps/admin` runs `vite build`. `apps/server` has a no-op `build` script (just echoes a notice) only to satisfy Cloudflare Workers Builds' user-build-command — actual bundling and deploy are handled by `wrangler deploy`, not turbo.
- `pnpm lint` — turbo `lint`. Admin and server both participate. `packages/typescript-config` has no lint script.
- `pnpm check-types` — turbo `check-types`. Both admin and server run `tsc --noEmit`.
- `pnpm format` — prettier on `**/*.{ts,tsx,md}` (run at root, NOT via turbo).

Filter a single workspace: `pnpm turbo <task> --filter=admin` (or `server`, `@repo/ui`, …).

Admin-specific (run inside `apps/admin` or with `--filter=admin`):
- `pnpm dev` → `vite dev --port 3000`
- `pnpm build` → `vite build`
- `pnpm preview` → `vite preview`
- `pnpm test` → `vitest run`
- `pnpm deploy` → `vite build && wrangler deploy`

Server-specific (run inside `apps/server` or with `--filter=server`):
- `pnpm dev` → `wrangler dev`
- `pnpm deploy` → `wrangler deploy --minify`
- `pnpm cf-typegen` → regenerates `CloudflareBindings` types from `wrangler.jsonc`
- `pnpm db:generate|db:migrate|db:push|db:studio` → drizzle-kit helpers (wraps in `dotenv -e .dev.vars`)
- `pnpm auth:generate` → Better Auth schema codegen

## Conventions

- All workspaces are `"type": "module"`.
- TypeScript everywhere (`typescript@5.9.2` pinned at root).
- ESLint 9 flat config per package, `--max-warnings 0`.
- `@repo/ui` ships `.tsx` source directly — consumers transpile it. No dist, no build step for ui.
- `apps/admin` uses `@repo/eslint-config/react-internal` (NOT `next-js` — admin is Vite, not Next).
- `apps/admin/tsconfig.json` is stand-alone (not extending `@repo/typescript-config/*`) because TanStack Start's `moduleResolution: "bundler"` is incompatible with the shared base's `NodeNext`.
- Cloudflare Worker compatibility date: `2026-04-11` (see `apps/server/wrangler.jsonc` and `apps/admin/wrangler.jsonc`).
- Wrangler pinned to `^4.70.0` in both admin and server.

## Gotchas

- Adding a new task to `turbo.json`? Only `build`, `lint`, `check-types`, `dev` are currently defined. `format` is intentionally outside turbo.
- `apps/server` is a Hono Worker, not a Node app — Node built-ins require the `nodejs_compat` compatibility flag (enabled in `wrangler.jsonc`).
- `apps/admin` is **Vite + TanStack Start, NOT Next.js.** Never use `@repo/eslint-config/next-js`, never extend `@repo/typescript-config/nextjs.json`, never import from `next/*`.
- TanStack Start has no RSC yet — use `createServerFn` and server routes on `createFileRoute.server` instead.
- `pnpm.onlyBuiltDependencies` belongs at the workspace root package.json, not inside individual apps.
- When scaffolding anything with `@tanstack/cli create` into this monorepo, remove the nested `.git/` and per-project `node_modules/` it generates — pnpm handles deps from root.
- When adding a shared package, give it a `@repo/*` name and reference it as `"@repo/foo": "workspace:*"`.
