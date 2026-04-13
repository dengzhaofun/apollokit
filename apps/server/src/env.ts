import type { RequestIdVariables } from "hono/request-id";

import type { auth } from "./auth";

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export type AuthMethod = "session" | "admin-api-key" | "client-credential";

export type HonoEnv = {
  Variables: RequestIdVariables & {
    user: NonNullable<Session>["user"] | null;
    session: NonNullable<Session>["session"] | null;
    authMethod: AuthMethod | null;
  };
};
