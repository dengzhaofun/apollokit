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
import { checkInRouter } from "./modules/check-in";
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
app.route("/api/check-in", checkInRouter);

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
