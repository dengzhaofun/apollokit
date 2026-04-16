import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";

import { auth } from "./auth";
import type { HonoEnv } from "./env";
import { session } from "./middleware/session";
import { bannerRouter, bannerClientRouter } from "./modules/banner";
import {
  cdkeyRouter,
  cdkeyClientRouter,
} from "./modules/cdkey";
import { checkInRouter, checkInClientRouter } from "./modules/check-in";
import {
  clientCredentialRouter,
} from "./modules/client-credentials";
import {
  collectionRouter,
  collectionClientRouter,
} from "./modules/collection";
import {
  dialogueRouter,
  dialogueClientRouter,
} from "./modules/dialogue";
import {
  exchangeRouter,
  exchangeClientRouter,
} from "./modules/exchange";
import { friendRouter, friendClientRouter } from "./modules/friend";
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
import {
  teamRouter,
  teamClientRouter,
} from "./modules/team";
import { health } from "./routes/health";

const app = new OpenAPIHono<HonoEnv>();

// Base middleware
app.use("*", requestId());
app.use("*", logger());
app.use("*", prettyJSON());
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    credentials: true,
  }),
);

// Global error handler
app.onError((err, c) => {
  console.error(err);
  return c.json(
    { error: err.message, requestId: c.get("requestId") },
    500,
  );
});

// Better Auth — handle all /api/auth/* routes (uses module-level auth instance)
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Inject c.var.user / c.var.session for downstream business routes
app.use("*", session);

// Business routes
app.get("/", (c) => c.text("Hello apollokit 👋"));
app.route("/health", health);

// Admin routes — session or admin API key
app.route("/api/banner", bannerRouter);
app.route("/api/cdkey", cdkeyRouter);
app.route("/api/check-in", checkInRouter);
app.route("/api/client-credentials", clientCredentialRouter);
app.route("/api/collection", collectionRouter);
app.route("/api/dialogue", dialogueRouter);
app.route("/api/item", itemRouter);
app.route("/api/exchange", exchangeRouter);
app.route("/api/friend", friendRouter);
app.route("/api/friend-gift", friendGiftRouter);
app.route("/api/guild", guildRouter);
app.route("/api/lottery", lotteryRouter);
app.route("/api/mail", mailRouter);
app.route("/api/shop", shopRouter);
app.route("/api/team", teamRouter);

// C-end client routes — client credential + HMAC
app.route("/api/client/banner", bannerClientRouter);
app.route("/api/client/cdkey", cdkeyClientRouter);
app.route("/api/client/check-in", checkInClientRouter);
app.route("/api/client/collection", collectionClientRouter);
app.route("/api/client/dialogue", dialogueClientRouter);
app.route("/api/client/item", itemClientRouter);
app.route("/api/client/exchange", exchangeClientRouter);
app.route("/api/client/friend", friendClientRouter);
app.route("/api/client/friend-gift", friendGiftClientRouter);
app.route("/api/client/guild", guildClientRouter);
app.route("/api/client/lottery", lotteryClientRouter);
app.route("/api/client/mail", mailClientRouter);
app.route("/api/client/shop", shopClientRouter);
app.route("/api/client/team", teamClientRouter);

// OpenAPI document + Scalar UI
app.doc31("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "apollokit API",
    version: "0.1.0",
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

export default app;
