import { apiKey } from "@better-auth/api-key";
import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { asc, eq } from "drizzle-orm";

import { db } from "./db";
import { member } from "./schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [
    "http://localhost:3000",
    "https://apollokit-admin.limitless-ai.workers.dev",
  ],
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization({
      creatorRole: "owner",
    }),
    apiKey([
      {
        configId: "admin",
        defaultPrefix: "ak_",
        references: "organization",
      },
    ]),
  ],
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          // Auto-select the user's earliest organization as the active one
          // on sign-in so the frontend doesn't have to call setActive.
          const [first] = await db
            .select({ organizationId: member.organizationId })
            .from(member)
            .where(eq(member.userId, session.userId))
            .orderBy(asc(member.createdAt))
            .limit(1);
          return {
            data: {
              ...session,
              activeOrganizationId: first?.organizationId ?? null,
            },
          };
        },
      },
    },
  },
});
