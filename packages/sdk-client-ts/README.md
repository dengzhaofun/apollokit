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

End-user sign-up / sign-in / session is powered by
[better-auth](https://www.better-auth.com)'s official client, pointed at
the player-facing auth instance on the apollokit server. The factory
just wires up the cpk\_ key and the server's `/api/client/auth` base
path — every method on the returned client is straight better-auth.

### Framework-agnostic (Node / browser / Workers)

```ts
import { createApolloClientAuth } from "@apollokit/client";

const auth = createApolloClientAuth({
  baseURL: "https://api.example.com",
  publishableKey: "cpk_…",
});

await auth.signUp.email({ email, password, name });
const { data } = await auth.signIn.email({ email, password });
const session = await auth.getSession();
await auth.signOut();
```

### React (TanStack Start, Next, plain React)

```ts
import { createApolloClientAuthReact } from "@apollokit/client/react";

export const auth = createApolloClientAuthReact({
  baseURL: "https://api.example.com",
  publishableKey: "cpk_…",
});

// in a component:
const { data: session, isPending } = auth.useSession();
```

In the browser the session rides on cookies that better-auth sets
automatically. On Node / native clients use the bearer token from the
sign-in response on subsequent business calls.

> The full method surface (password reset, email verification, social
> providers, etc.) is whatever the apollokit server's better-auth
> instance exposes — see the
> [better-auth client docs](https://www.better-auth.com/docs/concepts/client).
> Adding a plugin server-side is enough; the SDK does not need to be
> regenerated.

## Resilient experiment evaluation (`safeEvaluate`)

The auto-generated `ExperimentClientService.experimentClientPostEvaluate`
throws on network errors. For game clients where a single transient
blip would hang player launch, use the resilient wrapper:

```ts
import { safeEvaluate } from "@apollokit/client";

const variants = await safeEvaluate({
  keys: ["onboarding_flow", "shop_price_tier"],
  // Tenant-supplied attributes for targeting rules
  attributes: { plan: "free", cohort: "beta", country: "JP" },
  // Used only when the network call AND the in-memory cache both miss
  fallback: {
    onboarding_flow: "control",
    shop_price_tier: "control",
  },
});

if (variants.onboarding_flow?.variantKey === "A") {
  // …show variant A onboarding
}
const mult =
  (variants.shop_price_tier?.config as { rewardMultiplier?: number })
    ?.rewardMultiplier ?? 1;
```

Three layers of resilience built in:

1. **Try/catch** — never throws. Caller doesn't have to wrap.
2. **In-memory cache (60 s TTL)** — repeat calls with the same
   `keys + attributes` skip the round-trip. Stale entries also
   become a fallback if a later call fails.
3. **Caller fallback** — `{ key: 'control' }` map applied only when
   both network AND cache miss, so the game still has a defined
   variant for every requested experiment.

Call `clearSafeEvaluateCache()` on player log-out to drop the cache.

## Regenerating

```bash
pnpm --filter=server openapi:dump
pnpm --filter=@repo/sdk-core run openapi
pnpm --filter=@apollokit/client generate
```
