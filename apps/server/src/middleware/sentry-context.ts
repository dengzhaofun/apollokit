import * as Sentry from "@sentry/cloudflare";
import { createMiddleware } from "hono/factory";

import type { HonoEnv } from "../env";

// 给当前 isolate 的 Sentry scope 打上请求上下文：user / org / authMethod /
// requestId。Sentry SDK 未初始化时（本地 dev、单测）这些 setUser/setTag
// 调用会被 SDK 当成 no-op，不会抛错，所以中间件无条件挂。
//
// 必须放在 `session` 中间件之后（要读 c.var.user / c.var.session），并且
// 早于业务路由 —— 这样路由里抛出的异常被 Sentry 捕获时，scope 已经带上
// 当前用户/租户标签，可以直接在 Sentry UI 按租户筛 issue。
export const sentryContext = createMiddleware<HonoEnv>(async (c, next) => {
  const user = c.var.user;
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email });
  }
  const orgId = c.var.session?.activeOrganizationId;
  if (orgId) {
    Sentry.setTag("org_id", orgId);
  }
  Sentry.setTag("auth_method", c.var.authMethod ?? "anonymous");
  Sentry.setTag("request_id", c.get("requestId"));
  await next();
});
