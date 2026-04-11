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

## Error handling — throw, map in router `onError`

Routes throw `ModuleError` subclasses from handlers. Each router
declares an `onError` that maps them:

```ts
checkInRouter.onError((err, c) => {
  if (err instanceof ModuleError) {
    return c.json(
      { error: err.message, code: err.code, requestId: c.get("requestId") },
      err.httpStatus as ContentfulStatusCode,
    );
  }
  throw err; // global app.onError → 500
});
```

Don't try to return `c.json(..., err.httpStatus)` inline per handler:
`@hono/zod-openapi` requires every status literal to match a specific
declared response, and a runtime-typed status won't narrow.

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
