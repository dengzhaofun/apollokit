# apps/server — conventions

Hono API on Cloudflare Workers. `@hono/zod-openapi` for routes, Drizzle ORM
on Neon Postgres (HTTP driver), Better Auth (with organization plugin) for
admin auth and multi-tenancy. All business modules follow the pattern
established by `src/modules/check-in/` — read that module before adding a
new one.

## Module layout

Every business module lives at `src/modules/<kebab-name>/` and contains the
same file set:

```
src/modules/<name>/
├── types.ts        # domain types, enums, $inferSelect re-exports
├── errors.ts       # typed error classes extending ModuleError
├── validators.ts   # Zod schemas + .openapi() metadata (service I/O + HTTP I/O)
├── time.ts         # pure time/cycle utilities (optional, only if needed)
├── service.ts      # protocol-agnostic business logic (see "Service layer purity")
├── routes.ts       # HTTP adapter (OpenAPIHono router)
└── index.ts        # barrel: createXService factory + xService singleton + xRouter
```

**Schema files do NOT live inside the module folder.** Table definitions go
in `src/schema/<module>.ts` and are re-exported from `src/schema/index.ts`.
This keeps the Drizzle surface area visible in one directory and keeps
modules focused on behavior.

## Table naming — always module-prefixed

Every table a module owns must be prefixed with the module name:
`check_in_configs`, `check_in_user_states`, (future) `points_ledger`,
`task_definitions`, …

Never use unprefixed generic names (`configs`, `records`, `users`). They
will collide as modules pile up.

## The two userIds

There are **two** distinct user-id concepts on this server. They must
never be confused in code, schema, or API payloads:

1. **Better Auth admin user** — `c.var.user.id`, `session.userId`, the
   row in `user` / `member`. This is the *SaaS operator* managing the
   tenant (the customer's backend dashboard user).
2. **End user** — the SaaS customer's own business user id. Opaque
   `text`, unknown format, **never a foreign key**. In code, schema, and
   API it is always named **`endUserId`**. The different name is the
   safety mechanism — if you see `userId` it's always the admin.

Never pass `c.var.user.id` into a business service as an end user id.
Never name an end user column `user_id`.

> **Why `endUserId` and not something prettier?** The awkwardness is
> load-bearing. We considered `gameUserId` (too narrow — apollokit is a
> generic SaaS toolkit, not a gaming platform), `tenantUserId` (the
> tenant *is* the org, not a user), and `appUserId` (too close to
> `userId`, defeats the point). The mildly weird name is a deliberate
> speed-bump so nobody types `userId = c.var.user.id` on autopilot.

## Service layer purity

`service.ts` **must not import**:

- `hono`, `@hono/zod-openapi`, or any HTTP machinery
- `../../db` (or any concrete dependency instance)
- `../../deps` (the constant — only the `AppDeps` *type* is allowed)

The service file only imports the `AppDeps` **type** and receives its
dependencies through a `Pick<AppDeps, ...>` factory parameter. This is
what lets future protocols (cron jobs, internal RPC, MCP servers, unit
tests) reuse the exact same business logic without any HTTP coupling.

Services return plain data or throw `ModuleError` subclasses. They
don't know what a `Context` is.

## Dependency injection — the `AppDeps` pattern

We do not use a DI framework (tsyringe / inversify / reflect-metadata
all cost bundle size and runtime reflection which Workers hates).
Instead:

1. **`src/deps.ts`** declares a single `AppDeps` type and a `deps`
   singleton. Adding a new shared dependency (redis, logger, events,
   unified behavior log) changes ONE file — both the type and the
   singleton value.

2. **Each service factory** declares what it needs with
   `Pick<AppDeps, ...>`:

   ```ts
   type CheckInDeps = Pick<AppDeps, "db">;
   // Later: Pick<AppDeps, "db" | "redis" | "behaviorLog">
   export function createCheckInService(d: CheckInDeps) { ... }
   ```

   TypeScript tells you exactly which services need updating when
   `AppDeps` grows — not the ones that don't.

3. **Each module's `index.ts`** is the glue point. It imports `deps`
   and the factory, constructs the per-isolate singleton, and
   re-exports both the factory (for tests / alt wiring) and the
   singleton (for routes / jobs).

   ```ts
   import { deps } from "../../deps";
   import { createCheckInService } from "./service";
   export { createCheckInService };
   export const checkInService = createCheckInService(deps);
   export { checkInRouter } from "./routes";
   ```

4. **Routes** import the singleton, **never** the factory:
   `import { checkInService } from "./index"`.

5. **Tests** import the factory and pass mock deps:
   `createCheckInService({ db: fakeDb })`. No `jest.mock`, no
   container, no surprise.

Rule of thumb: if you're about to `import { db } from "../../db"`
inside a service file, stop — you're breaking the pattern.

## `neon-http` has no transactions — write single atomic SQL

`drizzle-orm/neon-http` runs over Neon's HTTP driver, which rejects
`db.transaction()`. All write paths must be expressed as a single
atomic statement. The canonical pattern (see
`modules/check-in/service.ts → checkIn`) is:

```sql
INSERT INTO <table> (...) VALUES (...)
ON CONFLICT (<key>) DO UPDATE SET ...
WHERE <table>.<column> IS DISTINCT FROM EXCLUDED.<column>
RETURNING *, (xmax = 0) AS inserted;
```

The conditional `WHERE` on `DO UPDATE` is what serializes concurrent
callers — losers get zero rows and take a re-read branch. Write that
reasoning in a file-header comment so the next person doesn't have to
rederive it.

## Route mounting — everything business-facing lives under `/api/*`

Better Auth claims `/api/auth/*`. All business module routers mount
under `/api/<module-name>` in `src/index.ts`, e.g.
`app.route("/api/check-in", checkInRouter)`. This leaves the
non-`/api` namespace free for top-level operational endpoints
(`/health`, `/`, `/docs`, `/openapi.json`).

When a module ships both admin and public routes, they are still both
under `/api/<module>/...` but distinguished by subpath and guarded by
different middleware (admin → `requireAuth`, public → future API-key
middleware).

## Admin-route auth — `requireAuth` per router, never global

`src/middleware/require-auth.ts` returns 401 if `c.var.user` is null and
400 if the session has no `activeOrganizationId`. Mount it **inside
each admin-facing router**:

```ts
export const checkInRouter = new OpenAPIHono<HonoEnv>();
checkInRouter.use("*", requireAuth);
```

Do **not** mount it globally on `app` in `src/index.ts`. Future public
routes (API-key / JWT auth for tenant frontends) must be free of
`requireAuth`, and a global mount would quietly break them.

## Response envelope — every business endpoint returns `{code, data, message, requestId}`

All business routes (everything under `/api/*` EXCEPT the Better Auth
mounts `/api/auth/*` and `/api/client/auth/*`, which are third-party
owned) return the standard envelope from
`src/lib/response.ts`:

```jsonc
// success
{ "code": "ok", "data": <payload>, "message": "", "requestId": "..." }
// business error (HTTP 4xx)
{ "code": "check_in.config_not_found", "data": null, "message": "...", "requestId": "..." }
// validation error (HTTP 400)
{ "code": "validation_error", "data": null, "message": "...", "requestId": "..." }
// unhandled (HTTP 500)
{ "code": "internal_error", "data": null, "message": "...", "requestId": "..." }
```

HTTP status codes follow REST: success 2xx, business/validation 4xx,
unhandled 5xx. Deletes and other "no payload" endpoints return HTTP
200 with `data: null` — NEVER 204, so the SDK/frontend unwrap logic
doesn't have to branch on status.

### How to write a route

1. Build the router with a factory from `lib/openapi.ts`, NOT
   `new OpenAPIHono<HonoEnv>()`:

   ```ts
   import { createAdminRouter } from "../../lib/openapi";
   export const checkInRouter = createAdminRouter();
   ```

   Three factories exist — pick the one that matches the route's auth:
   - `createAdminRouter()` — admin dashboard (session or `ak_`).
   - `createClientRouter()` — end-user `cpk_` + HMAC.
   - `createPublicRouter()` — unauthenticated (health, etc).

   Each factory wires:
   - `defaultHook` — Zod validation failures become the envelope with
     `code: "validation_error"`, HTTP 400.
   - `onError` — `ModuleError` instances become the envelope with the
     subclass's `code` and `httpStatus`. Unknown errors rethrow to the
     global `app.onError` which returns a 500 envelope.

   **Do not** write a `router.onError(...)` block in a module — the
   factory owns that. If you need module-specific error handling,
   extend `ModuleError` with a new subclass.

2. Declare each route with the matching `createXxxRoute` wrapper
   (adds `security` + `operationId`) and wrap every success response
   schema in `envelopeOf(...)`:

   ```ts
   import { createAdminRoute } from "../../lib/openapi";
   import { envelopeOf, commonErrorResponses, NullDataEnvelopeSchema } from "../../lib/response";

   createAdminRoute({
     method: "get",
     path: "/configs/{id}",
     responses: {
       200: {
         description: "OK",
         content: { "application/json": { schema: envelopeOf(CheckInConfigResponseSchema) } },
       },
       ...commonErrorResponses,  // 400 / 401 / 403 / 404 / 409 / 500
     },
   });

   // For delete / ack — 200 + null data (do NOT use 204)
   createAdminRoute({
     method: "delete",
     path: "/configs/{id}",
     responses: {
       200: {
         description: "Deleted",
         content: { "application/json": { schema: NullDataEnvelopeSchema } },
       },
       ...commonErrorResponses,
     },
   });
   ```

   This keeps the emitted OpenAPI spec honest about the wire format,
   so the generated SDK types in `packages/sdk-*-ts` are accurate.

3. Wrap every handler return in `ok(...)`:

   ```ts
   import { ok } from "../../lib/response";

   return c.json(ok(serializeConfig(row)), 201);
   return c.json(ok({ items: rows.map(serializeConfig) }), 200);
   return c.json(ok(null), 200);  // delete / ack
   ```

   `ok()` reads `requestId` from the `requestContext` AsyncLocalStorage —
   the handler doesn't need to pass anything.

4. **Do not** define a per-module `ErrorResponseSchema` in
   `validators.ts`. The shared `ErrorEnvelopeSchema` in
   `lib/response.ts` is what every 4xx/5xx response points at.

### Why not wrap via middleware?

A response-rewriting middleware would be smaller code, but the emitted
OpenAPI spec would still declare the unwrapped payload as the response
body — which would make every generated SDK type wrong. The explicit
`envelopeOf(schema)` at the declaration site is the price we pay for
accurate SDK contracts.

### Don't try to return `c.json(..., err.httpStatus)` inline per handler

`@hono/zod-openapi` requires every status literal to match a specific
declared response, and a runtime-typed status won't narrow. Throw
`ModuleError` subclasses and let the router factory's `onError`
translate them.

## Event history belongs to the unified behavior log (not here)

Per-action event history (who signed in, who redeemed what) is NOT
stored inside each module. A future unified behavior-log subsystem will
own it. When that system lands, each service gains one line at the end
of its write path (`await logger.record({ type: "..." , ... })`) and
the rest stays untouched. Until then, modules track aggregate state
only.

## IDs — `crypto.randomUUID()`, nothing else

Workers runtime has `crypto.randomUUID()` built in. Do NOT add `uuid`
or `nanoid`. All id columns are `text` with
`.$defaultFn(() => crypto.randomUUID())`.

## No public routes yet

MVP is admin-only. Public routes (consumed by tenant frontends directly)
need API-key or JWT auth that does not exist yet. The service layer
is designed so that when public routes arrive they will mount under a
different base path, reuse the same module-level service singletons,
and resolve `organizationId` from the API key instead of the session.

## Migration flow

1. Edit / add table in `src/schema/<module>.ts` and re-export from
   `src/schema/index.ts`.
2. `pnpm --filter=server db:generate` — produces SQL in `drizzle/`.
3. Read the generated SQL. Verify indexes, constraints, partial
   unique indexes, cascade rules.
4. `pnpm --filter=server db:migrate` applies it to the Neon branch
   configured in `.dev.vars`.
5. Commit both the schema and the generated migration file together.

## Testing

Vitest runs in plain Node, **not** under `@cloudflare/vitest-pool-workers`.
Our code only touches Web Standards APIs (`fetch`, `crypto`, `Intl`,
`neon-http`) and Better Auth, all of which behave identically in Node and
workerd. Pool-workers adds real startup cost for marginal fidelity gain —
we'll revisit when we actually bind KV / DO / R2 / AI.

**The `cloudflare:workers` shim.** `src/db.ts` and `src/auth.ts` import
`env` from the wrangler-only virtual module `cloudflare:workers`.
`vitest.config.ts` aliases that specifier to
`src/testing/cloudflare-workers-shim.ts`, which exposes `env` as lazy
getters over `process.env`. `src/testing/setup.ts` loads `.dev.vars` into
`process.env` (via `dotenv`, `override: false` so CI secrets always win)
before any test module is imported.

Tests hit the **real Neon dev branch** in `.dev.vars`. We do not mock
the database — the `neon-http` upsert pattern documented in the
`neon-http` section above depends on real Postgres `ON CONFLICT … DO
UPDATE … WHERE` semantics, and mocks would hide exactly the concurrency
bugs the pattern exists to catch.

**Two layers of tests, different entry points:**

1. **Service-layer** (`modules/<name>/service.test.ts`) — the main event.
   Instantiates the service factory directly with the real `db`
   singleton. Bypasses Hono, Better Auth, and cookies entirely. Covers
   all business logic: streaks, cycles, targets, idempotency, timezone
   edge cases, typed errors. Use `svc.checkIn({ ..., now })` style
   clock injection to test cross-day behavior in-process.

2. **Route-layer** (`modules/<name>/routes.test.ts`) — thin. Exercises
   only the HTTP edges: `requireAuth` 401, path prefix, Zod validation
   → 400, `ModuleError` → router `onError` status mapping, one happy
   path end-to-end. Drives `app.request("/api/auth/sign-up/email", …)`
   and `/api/auth/organization/create` in-process to get a real session
   cookie — no curl, no wrangler.

**Test data isolation via cascade.** `src/testing/fixtures.ts` exposes
`createTestOrg(label)` / `deleteTestOrg(id)`. Each test file seeds its
own `organization` row with a random id in `beforeAll` and deletes it
in `afterAll`. ON DELETE CASCADE on every module FK (`check_in_configs`,
`check_in_user_states`, future `points_*`, `task_*`, …) sweeps the rest.
**Fixtures are the only place that touches `organization` directly** —
tests never seed module tables via raw SQL.

`vitest.config.ts` sets `fileParallelism: false` so two test files can't
seed overlapping orgs into the same Neon branch. Tests within a single
file run serially by default.

**Scripts:** `pnpm --filter=server test` (one-shot), `pnpm --filter=server
test:watch` (interactive). No `turbo` task yet — only `apps/server` has
tests.

## Don'ts

- Don't import `hono` or `@hono/zod-openapi` from `service.ts` or `time.ts`.
- Don't import `../../db` from `service.ts`.
- Don't use Better Auth's `user.id` as an end-user id anywhere.
- Don't name an end-user column `user_id`.
- Don't call `db.transaction(...)` — it will throw at runtime.
- Don't put event-log tables inside a module.
- Don't add a new dep to a service factory by fishing it in as an
  import — add it to `AppDeps` and extend the factory's `Pick`.
- Don't mount `requireAuth` globally.
- Don't mock the database in tests — use `createTestOrg` + cascade.
- Don't seed module tables directly in test setup — go through the
  service factory or fixtures, never raw inserts into `check_in_*`.
