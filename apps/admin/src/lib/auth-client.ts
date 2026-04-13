import { apiKeyClient } from "@better-auth/api-key/client"
import { createAuthClient } from "better-auth/react"
import { organizationClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_SERVER_URL ?? "http://localhost:8787",
  plugins: [organizationClient(), apiKeyClient()],
})
