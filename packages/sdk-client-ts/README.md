# `@apollokit/client`

Official TypeScript SDK for **end-user / client-facing** calls against
the apollokit API. Browsers, Unity (WebGL), Cocos Creator, mini-programs,
Node SSR, Electron — anywhere you talk to apollokit on behalf of a player.

> **Server-to-server calls** belong in
> [`@apollokit/server`](../sdk-server-ts) — that SDK uses an admin
> `ak_` key and assumes a trusted environment.

## Install

```bash
pnpm add @apollokit/client
```

## 30-second quickstart (browser)

```ts
import {
  createClient,
  BadgeClientService,
} from "@apollokit/client";

createClient({
  baseUrl: "https://api.example.com",
  publishableKey: "cpk_…", // safe to ship in client bundles
  // secret intentionally omitted — csk_ must never reach a browser
});

// Your backend pre-signed the user hash; pass it on each call.
const { data } = await BadgeClientService.badgeClientGetTree({
  headers: {
    "x-end-user-id": "player_42",
    "x-user-hash": "<server-signed hash>",
  },
  throwOnError: true,
});
console.log(data[200].data.nodes);
```

## 30-second quickstart (Node / SSR — auto-HMAC)

When you're calling from a trusted server you can hand the SDK the
`csk_` secret and it auto-signs every request:

```ts
import {
  createClient,
  CheckInClientService,
} from "@apollokit/client";

createClient({
  baseUrl: "https://api.example.com",
  publishableKey: "cpk_…",
  secret: process.env.APOLLOKIT_CLIENT_SECRET!, // "csk_…"
});

// No x-user-hash needed — the interceptor signs from `secret + x-end-user-id`.
const { data } = await CheckInClientService.checkInClientPostCheckIns({
  headers: { "x-end-user-id": "player_42" },
  body: { configKey: "daily" },
  throwOnError: true,
});
```

## Service classes per OpenAPI tag

The SDK is **class-based, grouped by OpenAPI tag** — one `XxxClientService`
class per module. IDE autocomplete on `import { ` lists every available
service (`BadgeClientService`, `BannerClientService`,
`CheckInClientService`, …). When the server adds a new client-facing
module, re-running codegen produces a new service class with no SDK
source changes.

## Auth model

| Use case | Configure | Per-request headers |
|----------|-----------|---------------------|
| Browser / Unity / mini-program | `publishableKey` only | `x-end-user-id` + `x-user-hash` (your backend pre-signs) |
| Node / SSR / proxy | `publishableKey` + `secret` | just `x-end-user-id` (SDK signs) |

Backend pre-signing helper (give the resulting hash to your client):

```ts
import { signEndUser } from "@apollokit/client";
const userHash = await signEndUser(endUserId, process.env.APOLLOKIT_CLIENT_SECRET!);
```

## Errors

```ts
import {
  ApolloKitApiError,
  BadgeClientService,
  isErrorEnvelope,
} from "@apollokit/client";

const { data, error, response } = await BadgeClientService.badgeClientGetTree({
  headers: { "x-end-user-id": "player_42", "x-user-hash": "…" },
});
if (error && isErrorEnvelope(error)) {
  throw new ApolloKitApiError(error, response.status);
}
if (data && data[200]?.code === "ok") {
  console.log(data[200].data.nodes);
}
```

`ApolloKitApiError` is the same class exported by `@apollokit/server`,
so `instanceof` checks work consistently across SDKs.

## Retries

By default `createClient` installs a response interceptor that retries
`429` and `5xx` responses on idempotent methods (GET/HEAD/OPTIONS) with
exponential backoff (3 attempts). Customize or disable:

```ts
createClient({
  baseUrl,
  publishableKey,
  retry: { maxAttempts: 5, baseDelayMs: 500 },
  // or: retry: false
});
```

## End-user auth

Email + password sign-up / sign-in for end users (separate Better Auth
instance from admin):

```ts
import { signUpEmail, signInEmail, getSession, signOut } from "@apollokit/client";

const config = { baseUrl: "https://api.example.com", publishableKey: "cpk_…" };

await signUpEmail(config, { email, password, name });
const { user, token } = await signInEmail(config, { email, password });
const session = await getSession(config); // null when signed-out
await signOut(config);
```

In the browser the session rides on cookies (`credentials: "include"`).
On Node / native clients pass the returned `token` as
`Authorization: Bearer <token>` on subsequent business calls.

## Regenerating

```bash
pnpm --filter=server openapi:dump
pnpm --filter=@repo/sdk-core run openapi
pnpm --filter=@apollokit/client generate
```
