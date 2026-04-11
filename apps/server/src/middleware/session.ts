import { createMiddleware } from "hono/factory";

import { auth } from "../auth";
import type { HonoEnv } from "../env";

export const session = createMiddleware<HonoEnv>(async (c, next) => {
  const data = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", data?.user ?? null);
  c.set("session", data?.session ?? null);
  await next();
});
