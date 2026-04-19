import { createMiddleware } from "hono/factory";

import { auth } from "../auth";
import type { HonoEnv } from "../env";

export const session = createMiddleware<HonoEnv>(async (c, next) => {
  const data = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", data?.user ?? null);
  // Better Auth types `activeOrganizationId` as optional (`string | null |
  // undefined`) because the organization plugin doesn't teach the session
  // inferrer about the column it adds. At runtime the `session.create.before`
  // hook in `src/auth.ts` always populates it, so normalize `undefined → null`
  // here to match the `InferredSession` shape declared in `env.ts`.
  const rawSession = data?.session ?? null;
  c.set(
    "session",
    rawSession
      ? {
          ...rawSession,
          activeOrganizationId: rawSession.activeOrganizationId ?? null,
        }
      : null,
  );
  c.set("authMethod", data?.user ? "session" : null);
  await next();
});
