import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";

import { auth } from "./auth";
import { deps } from "./deps";
import { endUserAuth, EU_ORG_ID_HEADER } from "./end-user-auth";
import type { HonoEnv } from "./env";
import { registerSecuritySchemes, validationDefaultHook } from "./lib/openapi";
import { requestContext } from "./lib/request-context";
import { INTERNAL_ERROR_CODE, NOT_FOUND_CODE, fail } from "./lib/response";
import { requireClientCredential } from "./middleware/require-client-credential";
import { requestLog } from "./middleware/request-log";
import { session } from "./middleware/session";
import { analyticsRouter } from "./modules/analytics";
import {
  announcementRouter,
  announcementClientRouter,
} from "./modules/announcement";
import { badgeRouter, badgeClientRouter } from "./modules/badge";
import { bannerRouter, bannerClientRouter } from "./modules/banner";
import {
  cdkeyRouter,
  cdkeyClientRouter,
} from "./modules/cdkey";
import { characterRouter } from "./modules/character";
import { checkInRouter, checkInClientRouter } from "./modules/check-in";
import {
  clientCredentialRouter,
} from "./modules/client-credentials";
import { cmsRouter, cmsClientRouter } from "./modules/cms";
import { endUserRouter } from "./modules/end-user";
import {
  collectionRouter,
  collectionClientRouter,
} from "./modules/collection";
import {
  currencyRouter,
  currencyClientRouter,
} from "./modules/currency";
import {
  dialogueRouter,
  dialogueClientRouter,
} from "./modules/dialogue";
import {
  entityRouter,
  entityClientRouter,
} from "./modules/entity";
import {
  exchangeRouter,
  exchangeClientRouter,
} from "./modules/exchange";
import { friendRouter, friendClientRouter } from "./modules/friend";
import { inviteRouter, inviteClientRouter } from "./modules/invite";
import {
  guildRouter,
  guildClientRouter,
} from "./modules/guild";
import {
  friendGiftRouter,
  friendGiftClientRouter,
} from "./modules/friend-gift";
import { itemRouter, itemClientRouter } from "./modules/item";
import {
  lotteryRouter,
  lotteryClientRouter,
} from "./modules/lottery";
import { mailRouter, mailClientRouter } from "./modules/mail";
import { shopRouter, shopClientRouter } from "./modules/shop";
import { mediaLibraryRouter } from "./modules/media-library";
import { storageBoxRouter } from "./modules/storage-box";
import {
  teamRouter,
  teamClientRouter,
} from "./modules/team";
// level / leaderboard / activity MUST be imported BEFORE task — the task
// barrel installs an event forwarder that walks the registry at import
// time, so every event these modules publish must already be registered.
import {
  levelRouter,
  levelClientRouter,
} from "./modules/level";
import {
  leaderboardRouter,
  leaderboardClientRouter,
} from "./modules/leaderboard";
import {
  activityRouter,
  activityClientRouter,
} from "./modules/activity";
import { wireKindEventSubscriptions } from "./modules/activity/kind/event-bridge";
import {
  battlePassRouter,
  battlePassClientRouter,
} from "./modules/battle-pass";
import {
  assistPoolRouter,
  assistPoolClientRouter,
} from "./modules/assist-pool";
import {
  taskRouter,
  taskClientRouter,
} from "./modules/task";
import { eventCatalogRouter } from "./modules/event-catalog";
import { rankClientRouter, rankRouter } from "./modules/rank";
import { webhooksRouter } from "./modules/webhooks";
import { health } from "./routes/health";
import { scheduled } from "./scheduled";

const app = new OpenAPIHono<HonoEnv>({
  defaultHook: validationDefaultHook,
});

// Base middleware
app.use("*", requestId());
app.use("*", logger());
app.use("*", prettyJSON());
// `crossOriginResourcePolicy: "cross-origin"` — the media-library
// `<img>` proxy (`/api/media-library/object/...`) is loaded via same-
// origin admin URL in the main flow, but browsers still mark such
// sub-resource loads as cross-origin when the request path is served
// by a different worker underneath service binding. Keep cross-origin
// so image loads don't get blocked.
app.use(
  "*",
  secureHeaders({
    crossOriginResourcePolicy: "cross-origin",
  }),
);
// No CORS: admin reaches this worker through a service binding (not a
// browser cross-origin fetch), and no first-party browser consumer of
// this worker exists yet. If a real cross-origin use-case lands later
// (e.g. SDK calling `/api/client/auth/*` from a game's web client),
// re-introduce `cors()` scoped to those paths only.

// Global error handler — returns the standard envelope. Module-level
// routers handle `ModuleError` in their own `onError` (installed by
// `createAdminRouter` / `createClientRouter` in `lib/openapi.ts`);
// anything that reaches here is unexpected.
app.onError((err, c) => {
  console.error(err);
  return c.json(fail(INTERNAL_ERROR_CODE, err.message), 500);
});

// Global 404 — fires when no route matched at all (Hono's default is
// `404 Not Found` plain text). Business module routers already cover
// their own sub-paths; Better Auth's `/api/auth/*` and
// `/api/client/auth/*` wildcards claim those prefixes. Anything that
// still lands here is an unknown URL, so we return the standard
// envelope so SDKs / frontend wrappers don't have to branch on
// content-type.
app.notFound((c) =>
  c.json(fail(NOT_FOUND_CODE, `Not found: ${c.req.method} ${c.req.path}`), 404),
);

// Better Auth — handle all /api/auth/* routes (uses module-level auth instance)
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// End-user Better Auth — serves game players, not SaaS operators.
// requireClientCredential runs first to resolve the `cpk_` into an
// `organizationId`. We then rebuild the request with a private header
// carrying that org id, so `end-user-auth.ts` hooks can tenant-scope
// every sign-up/sign-in.
//
// `EU_ORG_ID_HEADER` is stripped from the incoming request before we
// set it ourselves — if a client forges that header, we wipe it here.
// Any other route in this file that forwards requests to
// `endUserAuth.handler` without going through this middleware MUST
// also strip the header.
app.use("/api/client/auth/*", requireClientCredential);
app.on(["POST", "GET"], "/api/client/auth/*", (c) => {
  const orgId = c.var.clientCredential!.organizationId;
  const scopedHeaders = new Headers(c.req.raw.headers);
  scopedHeaders.delete(EU_ORG_ID_HEADER);
  scopedHeaders.set(EU_ORG_ID_HEADER, orgId);
  const scopedRequest = new Request(c.req.raw.url, {
    method: c.req.raw.method,
    headers: scopedHeaders,
    body:
      c.req.raw.method === "GET" || c.req.raw.method === "HEAD"
        ? undefined
        : c.req.raw.body,
    redirect: c.req.raw.redirect,
    signal: c.req.raw.signal,
    // `duplex: "half"` is required by the fetch spec when the body is a
    // stream. Workers runtime accepts it; TS lib types don't have the
    // field yet.
    ...({ duplex: "half" } as { duplex: "half" }),
  });
  return endUserAuth.handler(scopedRequest);
});

// Inject c.var.user / c.var.session for downstream business routes
app.use("*", session);
// Put the per-request AsyncLocalStorage store in place so domain-event
// subscribers can stamp Tinybird rows with the same `traceId` that
// `http_requests` records. Must wrap everything AFTER `requestId()` has
// run but BEFORE any handler may emit events.
app.use("*", (c, next) =>
  requestContext.run({ traceId: c.get("requestId") }, next),
);
// Auto-ingest every request into Tinybird's http_requests dataset.
// Must run AFTER session so we know which tenant to tag.
app.use("*", requestLog);

// Business routes
app.get("/", (c) => c.text("Hello apollokit 👋"));
app.route("/health", health);

// Admin routes — session or admin API key
app.route("/api/analytics", analyticsRouter);
app.route("/api/announcement", announcementRouter);
app.route("/api/badge", badgeRouter);
app.route("/api/banner", bannerRouter);
app.route("/api/battle-pass", battlePassRouter);
app.route("/api/cdkey", cdkeyRouter);
app.route("/api/character", characterRouter);
app.route("/api/check-in", checkInRouter);
app.route("/api/client-credentials", clientCredentialRouter);
app.route("/api/cms", cmsRouter);
app.route("/api/end-user", endUserRouter);
app.route("/api/collection", collectionRouter);
app.route("/api/currency", currencyRouter);
app.route("/api/dialogue", dialogueRouter);
app.route("/api/entity", entityRouter);
app.route("/api/item", itemRouter);
app.route("/api/exchange", exchangeRouter);
app.route("/api/friend", friendRouter);
app.route("/api/friend-gift", friendGiftRouter);
app.route("/api/invite", inviteRouter);
app.route("/api/guild", guildRouter);
app.route("/api/lottery", lotteryRouter);
app.route("/api/mail", mailRouter);
app.route("/api/shop", shopRouter);
app.route("/api/storage-box", storageBoxRouter);
app.route("/api/media-library", mediaLibraryRouter);
app.route("/api/task", taskRouter);
app.route("/api/team", teamRouter);
app.route("/api/level", levelRouter);
app.route("/api/leaderboard", leaderboardRouter);
app.route("/api/activity", activityRouter);
app.route("/api/assist-pool", assistPoolRouter);
app.route("/api/event-catalog", eventCatalogRouter);
app.route("/api/rank", rankRouter);
app.route("/api/webhooks", webhooksRouter);

// C-end client routes — client credential + HMAC
app.route("/api/client/announcement", announcementClientRouter);
app.route("/api/client/badge", badgeClientRouter);
app.route("/api/client/banner", bannerClientRouter);
app.route("/api/client/battle-pass", battlePassClientRouter);
app.route("/api/client/cdkey", cdkeyClientRouter);
app.route("/api/client/check-in", checkInClientRouter);
app.route("/api/client/cms", cmsClientRouter);
app.route("/api/client/collection", collectionClientRouter);
app.route("/api/client/currency", currencyClientRouter);
app.route("/api/client/dialogue", dialogueClientRouter);
app.route("/api/client/entity", entityClientRouter);
app.route("/api/client/item", itemClientRouter);
app.route("/api/client/exchange", exchangeClientRouter);
app.route("/api/client/friend", friendClientRouter);
app.route("/api/client/friend-gift", friendGiftClientRouter);
app.route("/api/client/invite", inviteClientRouter);
app.route("/api/client/guild", guildClientRouter);
app.route("/api/client/lottery", lotteryClientRouter);
app.route("/api/client/mail", mailClientRouter);
app.route("/api/client/shop", shopClientRouter);
app.route("/api/client/task", taskClientRouter);
app.route("/api/client/team", teamClientRouter);
app.route("/api/client/level", levelClientRouter);
app.route("/api/client/leaderboard", leaderboardClientRouter);
app.route("/api/client/rank", rankClientRouter);
app.route("/api/client/activity", activityClientRouter);
app.route("/api/client/assist-pool", assistPoolClientRouter);

// Kind Handler 事件接线 —— 每个派生玩法 module 在自己的 barrel
// import 时通过 `kindRegistry.register(...)` 完成注册；所有 module
// import 结束后在这里把每个 handler 的 `subscribedEvents` 统一接到
// eventBus。放在路由挂载之后，保证所有 barrel 都已运行。
wireKindEventSubscriptions(deps);

// OpenAPI document + Scalar UI
//
// `registerSecuritySchemes` adds Session / AdminApiKey / ClientCredential
// to `components.securitySchemes`. The `security` array on each route is
// stamped per-router by `createAdminRoute` / `createClientRoute` /
// `createPublicRoute` from `./lib/openapi`.
registerSecuritySchemes(app);

app.doc31("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "apollokit API",
    version: "0.1.0",
    description:
      "apollokit is a multi-tenant game-SaaS backend. Routes are split into\n\n" +
      "- **Admin** (`/api/<module>/...`): used by SaaS operators from the admin dashboard. Authenticate with a Better Auth session cookie or an admin API key (`Authorization: Bearer ak_…`).\n" +
      "- **Client** (`/api/client/<module>/...`): consumed by tenant frontends on behalf of end users. Authenticate with a client public key (`X-Client-Public-Key: cpk_…`) plus HMAC headers (`X-Client-Signature`, `X-Client-Timestamp`, `X-Client-Nonce`).\n\n" +
      "Every business endpoint returns the standard envelope `{ code, data, message, requestId }`. Success uses `code: \"ok\"` and the payload in `data`. Validation errors use HTTP 400 and `code: \"validation_error\"`. Domain errors use the module-specific `code` (e.g. `check_in.config_not_found`) at their declared HTTP status. Better Auth routes (`/api/auth/*`, `/api/client/auth/*`) keep the third-party library's native format.",
  },
  servers: [{ url: "http://localhost:8787", description: "Dev" }],
});

app.get(
  "/docs",
  Scalar({
    url: "/openapi.json",
    pageTitle: "apollokit API",
  }),
);

// Module-worker form: Cloudflare reads `.fetch` and `.scheduled` off the
// default export. We attach `scheduled` directly to the Hono app instance
// so tests that still do `import app from "./index"` keep working with
// `app.request(...)` / `app.fetch(...)`.
Object.assign(app, { scheduled });
export default app as typeof app & { scheduled: typeof scheduled };
