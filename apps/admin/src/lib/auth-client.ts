import { apiKeyClient } from "@better-auth/api-key/client"
import { createAuthClient } from "better-auth/react"
import {
  lastLoginMethodClient,
  organizationClient,
} from "better-auth/client/plugins"

// No baseURL = same-origin requests. In prod, admin's worker forwards
// `/api/*` to the server via service binding (see `src/server.ts`). In
// dev, vite's `server.proxy` rewrites `/api/*` → `http://localhost:8787`
// (see `vite.config.ts`).
//
// `lastLoginMethodClient` mirrors the server-side `lastLoginMethod()`
// plugin (cookie-only) so the daveyplate AuthView can read the
// `better-auth.last_used_login_method` cookie and highlight the last
// used sign-in option.
export const authClient = createAuthClient({
  plugins: [organizationClient(), apiKeyClient(), lastLoginMethodClient()],
})
