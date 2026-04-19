/**
 * Shared OpenAPI header schema for C-end client routes.
 *
 * Every client router uses the middleware pair `requireClientCredential`
 * + `requireClientUser`, and therefore every route in such a router
 * accepts the same three headers. Declaring them once here keeps the
 * docs consistent and avoids drift across modules.
 *
 * Usage:
 *
 *   import { clientAuthHeaders } from "../../middleware/client-auth-headers";
 *
 *   router.openapi(
 *     createRoute({
 *       request: { headers: clientAuthHeaders, ... },
 *       ...
 *     }),
 *     async (c) => { ... },
 *   );
 */

import { z } from "@hono/zod-openapi";

export const clientAuthHeaders = z.object({
  "x-api-key": z.string().openapi({
    description: "Publishable key (cpk_...)",
  }),
  "x-end-user-id": z.string().openapi({
    description: "End user's opaque id",
  }),
  "x-user-hash": z.string().optional().openapi({
    description:
      "HMAC-SHA256(endUserId, clientSecret). Required unless dev mode is enabled.",
  }),
});
