# apollokit — Agent Guide

Durable project context for AI coding agents (Claude Code, Cursor, Copilot, etc.). Keep this file up to date as the project evolves.

## Project purpose

**apollokit** is a game SaaS platform. The frontend handles both the public-facing marketing site and the authenticated dashboard / project-management console in one TanStack Start app. A separate Hono worker backs it as the API + auth layer.

## Monorepo layout

```
apps/
  admin/   TanStack Start (Vite + React 19 + Tailwind v4) — marketing site + dashboard
           Dev: http://localhost:3000 · Deploy target: Cloudflare Workers (apollokit-admin)
  server/  Hono on Cloudflare Workers — API, Better Auth, Drizzle, Neon Postgres
           Dev: http://localhost:8787 (wrangler default) · Deploy target: apollokit-server
packages/
  ui/               @repo/ui — shared React components (source-level export, no build step)
                    Not currently consumed by admin; reserved for future shared UI.
  eslint-config/    @repo/eslint-config — entries: ./base, ./next-js, ./react-internal
  typescript-config/@repo/typescript-config — shared tsconfig bases (base, nextjs, react-library)
```

`pnpm-workspace.yaml` globs `apps/*` and `packages/*`. Internal packages are consumed via `workspace:*`.

### Previously present, removed

`apps/web` and `apps/docs` were `create-turbo` default-template scaffolds with no business code. Removed in commit `b3830b6` to clear the way for `apps/admin`. Do **not** recreate them.

## Tech stack per app

| App | Framework | Bundler | React | Styling | Testing | Deploy |
|---|---|---|---|---|---|---|
| `admin` | TanStack Start | Vite 7 | 19.2 | Tailwind v4 | Vitest + RTL | Cloudflare Workers |
| `server` | Hono + Zod OpenAPI | (wrangler) | — | — | — | Cloudflare Workers |

`server` additionally uses Better Auth (`^1.6.2`), Drizzle ORM (`^0.45.2`), `@neondatabase/serverless`.

## Commands

Run from repo root unless noted:

- `pnpm dev` — turbo runs `dev` in every app with a `dev` script (persistent, not cached). Starts admin on 3000 and server via wrangler on 8787 in parallel.
- `pnpm build` — turbo `build` across the graph. `apps/server` has no `build` script (deploys via wrangler, not turbo).
- `pnpm lint` — turbo `lint`. Both admin and server participate.
- `pnpm check-types` — turbo `check-types`. Admin runs `tsc --noEmit`; server runs `tsc --noEmit`.
- `pnpm format` — prettier on `**/*.{ts,tsx,md}` (run at root, NOT via turbo).

Filter a single workspace: `pnpm turbo <task> --filter=admin` (or `server`, `@repo/ui`, …).

Per-app:
- **admin**: `pnpm --filter=admin dev|build|preview|test|deploy`. Deploy does `vite build && wrangler deploy`.
- **server**: `pnpm --filter=server dev` (wrangler dev); `pnpm --filter=server deploy` (`wrangler deploy --minify`); Drizzle helpers `db:generate`, `db:migrate`, `db:push`, `db:studio`; Better Auth schema `auth:generate`. `cf-typegen` regenerates `CloudflareBindings` from `wrangler.jsonc`.

## Environment variables

Declared in `turbo.json` `globalEnv`:
- `DATABASE_URL` — Neon Postgres connection string (Better Auth + Drizzle)
- `BETTER_AUTH_SECRET` — Better Auth signing secret
- `BETTER_AUTH_URL` — Better Auth base URL

Local dev values live at `apps/server/.dev.vars` (read by wrangler; not checked in). When admin needs to talk to server auth, surface the same `BETTER_AUTH_URL` via Vite-exposed env (prefix `VITE_`).

## Deployment

- `apps/server` → Cloudflare Workers, project name `apollokit-server`, compat date `2026-04-11`, `nodejs_compat` flag, observability on. Secrets managed with `wrangler secret put`.
- `apps/admin` → Cloudflare Workers, project name `apollokit-admin`, compat date `2026-04-11`, `nodejs_compat` flag, observability on. Entry is `@tanstack/react-start/server-entry` (scaffolded default for `@cloudflare/vite-plugin`).
- Wrangler pinned to `^4.70.0` in both workspaces.

## Scaffold history (why admin looks like it does)

Admin was scaffolded with:

```bash
cd apps
pnpm dlx @tanstack/cli@latest create admin --add-ons cloudflare --no-examples
```

The original user-provided command was:
`npx @tanstack/cli@latest create my-tanstack-app --agent --tailwind --add-ons cloudflare`

It was adjusted because, in `@tanstack/cli@0.63+`:
- `--agent` is not a valid flag (silently ignored, absent from help)
- `--tailwind` is a no-op (Tailwind is now the default)
- There is no `--template blank`; `--no-examples` is the closest "minimal" switch
- Project name `admin` (positional) scaffolds directly into `apps/admin/` when run from `apps/`, avoiding a rename

Post-scaffold cleanup applied:
1. Removed the CLI-generated nested `.git/` and per-app `node_modules/` (pnpm handles deps from root)
2. Rewrote `apps/admin/package.json` to expose repo-standard `lint` + `check-types` scripts and depend on `@repo/eslint-config`
3. Replaced `apps/admin/eslint.config.js` with one that imports `@repo/eslint-config/react-internal` (admin is Vite, NOT Next — do not use the `next-js` preset)
4. Kept `apps/admin/tsconfig.json` stand-alone (like `apps/server`) because the scaffold's `moduleResolution: "bundler"` is incompatible with `@repo/typescript-config/base.json`'s `NodeNext`
5. Rewrote `apps/admin/wrangler.jsonc` with `apollokit-admin` name, `2026-04-11` compat date, observability on
6. Bumped `apps/server` wrangler from `^4.4.0` → `^4.70.0` to match admin (unified version)
7. Moved `pnpm.onlyBuiltDependencies` from admin's package.json to the workspace root

## Turbo task contract

Every app must expose scripts named `dev`, `build`, `lint`, `check-types` — these are the only task names defined in `turbo.json`. `apps/server` is exempted from `build` (deploys via wrangler directly) but still has `lint` + `check-types`.

Do **not** add new turbo tasks without also declaring them in `turbo.json`. `format` is intentionally kept outside turbo (runs directly via prettier at root).

## Known gotchas

- **admin is Vite, NOT Next.js.** Never apply `@repo/eslint-config/next-js`, never import `next`-only utilities, never extend `@repo/typescript-config/nextjs.json`.
- **TanStack Start does not support RSC** (as of 1.167+). Use server functions (`createServerFn`) and server routes instead.
- **Nested git/node_modules from scaffold.** `@tanstack/cli create` initializes its own git repo and per-project `node_modules`. Always remove both after scaffolding into a monorepo.
- **@tanstack/cli flags change.** `--agent`, `--tailwind`, and `--template blank` have all changed meaning or disappeared. Verify current behavior with `pnpm dlx @tanstack/cli@latest create --help` before copying old commands.
- **pnpm onlyBuiltDependencies must live at workspace root**, not in individual app package.json — pnpm explicitly warns about this.
- **Wrangler compat dates** must be ≤ today. `2026-04-11` matches the project's current frozen date (see `apps/server/wrangler.jsonc`).
- **`--no-examples` is cosmetic** in current `@tanstack/cli` — the scaffold still ships with a Header/Footer/ThemeToggle and a decorated demo home route. Treat these as starter code to replace, not load-bearing infrastructure.

## Next steps (for future agents picking this up)

1. **Wire admin ↔ server auth**: share Better Auth session cookies between `apollokit-admin` and `apollokit-server`. Set `BETTER_AUTH_URL` and trusted origins accordingly.
2. **Marketing routes**: replace the scaffold's `/` + `/about` with real marketing content; introduce a route group for public pages vs. authenticated dashboard.
3. **Dashboard routes**: add `(authed)` route group with loader-based session guard that calls server's `/api/auth/get-session`.
4. **Shared UI**: if the same components start living in both admin and (hypothetical) future apps, promote to `packages/ui` and wire admin to `"@repo/ui": "workspace:*"`.
5. **Tailwind v4 tokens**: the scaffold ships with custom CSS variables (`--sea-ink`, `--lagoon-deep`, etc.) in `src/styles.css`. Replace with brand tokens before shipping.

## TanStack Intent — skill mappings

`@tanstack/intent` discovered skills shipped by installed TanStack packages. Use these when working on the corresponding areas — load the named SKILL.md into context rather than guessing from memory. Because the skills are transitive deps under `.pnpm/`, paths are unstable; resolve at runtime with the companion command.

<!-- intent-skills:start -->
# Skill mappings - when working in these areas, load the linked skill file into context.
skills:
  - task: "bootstrap, entry points, root route document shell, routeTree.gen.ts, vite plugin wiring"
    # To load this skill, run: pnpm dlx @tanstack/intent@latest list | grep start-core/SKILL
  - task: "deploy admin to Cloudflare Workers, selective SSR per route, SPA mode, static prerender, ISR"
    # To load this skill, run: pnpm dlx @tanstack/intent@latest list | grep start-core/deployment
  - task: "server functions (createServerFn) — calling server-side code from UI without API boilerplate"
    # To load this skill, run: pnpm dlx @tanstack/intent@latest list | grep start-core/server-functions
  - task: "server routes — HTTP endpoints defined on createFileRoute.server (API endpoints inside admin)"
    # To load this skill, run: pnpm dlx @tanstack/intent@latest list | grep start-core/server-routes
  - task: "middleware — request middleware, server-function middleware, global createStart middleware, auth guards"
    # To load this skill, run: pnpm dlx @tanstack/intent@latest list | grep start-core/middleware
  - task: "routing — path params, splat routes, optional params, i18n locale patterns"
    # To load this skill, run: pnpm dlx @tanstack/intent@latest list | grep router-core/path-params
  - task: "search params — validateSearch, Zod/Valibot adapters, search middlewares, loaderDeps"
    # To load this skill, run: pnpm dlx @tanstack/intent@latest list | grep router-core/search-params
  - task: "SSR — streaming, HeadContent/Scripts, createRequestHandler, head meta management"
    # To load this skill, run: pnpm dlx @tanstack/intent@latest list | grep router-core/ssr
  - task: "TanStack type safety — Register declaration, from narrowing, getRouteApi, Link type inference"
    # To load this skill, run: pnpm dlx @tanstack/intent@latest list | grep router-core/type-safety
  - task: "not-found + error handling — notFound(), CatchBoundary, errorComponent, route masking"
    # To load this skill, run: pnpm dlx @tanstack/intent@latest list | grep router-core/not-found-and-errors
<!-- intent-skills:end -->

**How to use this block**: when an agent starts a task that touches one of the listed areas, run the companion command to locate the current SKILL.md path in `node_modules/.pnpm/...`, then `Read` that file. Do not rely on memorized TanStack Router/Start API — the library moves fast and your training data is stale.

To refresh this list after upgrading TanStack packages: `cd apps/admin && pnpm dlx @tanstack/intent@latest list` and update the `task` descriptions if new skills appear or old ones move.
