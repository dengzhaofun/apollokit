import { apiKeyClient } from "@better-auth/api-key/client"
import { createAuthClient } from "better-auth/react"
import {
  lastLoginMethodClient,
  oneTapClient,
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
//
// `oneTapClient` 走 Google Identity Services(GIS)在登录页直接弹原生
// One Tap 卡片;clientId 必须是 Google OAuth Web Client ID(同 server 端
// GOOGLE_CLIENT_ID,公开值)。`VITE_GOOGLE_CLIENT_ID` 由 `apps/admin/
// .env.production`(prod build)和本地 `.env.local`(dev)注入,Vite 在
// build 时静态替换。值为空(未配置)时 plugin 会注册但 GIS 不会工作。
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""

export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      teams: {
        enabled: true,
      },
    }),
    apiKeyClient(),
    lastLoginMethodClient(),
    oneTapClient({
      clientId: GOOGLE_CLIENT_ID,
      autoSelect: false,
      cancelOnTapOutside: true,
      context: "signin",
      promptOptions: { baseDelay: 1000, maxAttempts: 3 },
    }),
  ],
})
