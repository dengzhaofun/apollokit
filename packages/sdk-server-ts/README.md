# `@apollokit/server`

Official TypeScript SDK for **server-to-server** calls against the apollokit API.

> **Trusted environments only** — the admin API key (`ak_…`) carries
> full organization-level authority. Never ship it in browser bundles
> or game clients. For that use case install
> [`@apollokit/client`](../sdk-client-ts) (publishable `cpk_` + HMAC).

## Install

```bash
pnpm add @apollokit/server
# or: npm i / yarn add / bun add
```

## 30-second quickstart

```ts
import {
  createServerClient,
  AnnouncementAdminService,
} from "@apollokit/server";

createServerClient({
  baseUrl: "https://api.example.com",
  apiKey: process.env.APOLLOKIT_ADMIN_KEY!, // "ak_…"
});

// `throwOnError: true` makes 4xx/5xx throw and types-narrows success.
const { data } = await AnnouncementAdminService.announcementAdminGetRoot({
  throwOnError: true,
});
const announcements = data[200].data; // typed AnnouncementList
console.log(announcements.items);
```

The SDK is **class-based, grouped by OpenAPI tag** — one `XxxService`
class per module. IDE autocomplete on `import { ` lists every available
service (`BadgeAdminService`, `CharacterService`,
`CheckInRewardsService`, `BattlePassService`, …) so you don't have to
remember endpoint names.

When the server adds a new module, re-running codegen (see
[Regenerating](#regenerating)) produces a new `XxxService` class
automatically — no SDK source changes needed.

## Auth

Every request carries `x-api-key: ak_…` automatically once
`createServerClient(...)` runs. Issue keys from the admin dashboard's
`/api-keys` page (or `POST /api/auth/api-key` with `configId: "admin"`).

There is no `Authorization: Bearer` path — the middleware reads
`x-api-key` exclusively.

## Response shape

Every business endpoint returns the standard envelope:

```jsonc
{ "code": "ok", "data": <payload>, "message": "", "requestId": "..." }
```

`data[200]` is the success envelope — the actual payload sits at
`data[200].data`. `requestId` is the same id Tinybird logs against the
HTTP request, so paste it into the trace dashboard for end-to-end
debugging.

## Errors

Manual handling without `throwOnError`:

```ts
import {
  ApolloKitApiError,
  isErrorEnvelope,
  CheckInService,
} from "@apollokit/server";

const { data, error, response } = await CheckInService.checkInGetConfigs({});
if (error && isErrorEnvelope(error)) {
  throw new ApolloKitApiError(error, response.status);
}
if (data && data[200]?.code === "ok") {
  // data[200].data is typed
}
```

`ApolloKitApiError` exposes:

- `code` — module-specific identifier (`check_in.config_not_found`,
  `validation_error`, `internal_error`, …)
- `status` — HTTP status (4xx / 5xx)
- `requestId` — paste into the trace dashboard
- `message` — human-readable message from the server

The full code list lives in `apps/server/src/modules/<module>/errors.ts`.

## Multiple clients (multi-tenant proxies)

The default exported `client` is configured by `createServerClient`,
which is fine for single-tenant processes. For one-apollokit-org-per-
inbound-request proxies build isolated clients:

```ts
import { createClient } from "@hey-api/client-fetch";
import { AnnouncementAdminService } from "@apollokit/server";

function clientForTenant(apiKey: string) {
  const c = createClient({ baseUrl: "https://api.example.com" });
  c.interceptors.request.use((req) => {
    req.headers.set("x-api-key", apiKey);
    return req;
  });
  return c;
}

const result = await AnnouncementAdminService.announcementAdminGetRoot({
  client: clientForTenant("ak_…"),
  throwOnError: true,
});
```

## Retries

By default `createServerClient` installs a response interceptor that
retries `429` and `5xx` (502/503/504) responses on idempotent methods
(GET/HEAD/OPTIONS) with exponential backoff (3 attempts). Customize or
disable:

```ts
createServerClient({
  baseUrl,
  apiKey,
  retry: { maxAttempts: 5, baseDelayMs: 500, retryAllMethods: true },
  // or: retry: false
});
```

## Regenerating

The generated SDK lives in `src/generated/` and is committed. After
server route changes:

```bash
pnpm --filter=server openapi:dump          # refresh apps/server/openapi.json
pnpm --filter=@repo/sdk-core run openapi   # split into admin/client specs
pnpm --filter=@apollokit/server generate   # regenerate this package
```
