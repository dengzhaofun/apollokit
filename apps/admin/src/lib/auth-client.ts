import { apiKeyClient } from "@better-auth/api-key/client"
import { createAuthClient } from "better-auth/react"
import { organizationClient } from "better-auth/client/plugins"

// No baseURL = same-origin requests. In prod, admin's worker forwards
// `/api/*` to the server via service binding (see `src/server.ts`). In
// dev, vite's `server.proxy` rewrites `/api/*` → `http://localhost:8787`
// (see `vite.config.ts`).
export const authClient = createAuthClient({
  plugins: [organizationClient(), apiKeyClient()],
})
