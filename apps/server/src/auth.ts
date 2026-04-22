import { apiKey } from "@better-auth/api-key";
import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { asc, eq } from "drizzle-orm";

import { db } from "./db";
import { sendInviteEmail } from "./lib/mailer";
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
      // Better Auth calls this hook after it persists the invitation row.
      // We deliver the accept link via Cloudflare Email Service (or log
      // it to the console in dev — see `lib/mailer.ts`).
      //
      // Phase 2 will layer `createAccessControl({...statements})` + custom
      // roles on top of this — the Phase 1 default is owner/admin/member
      // from `better-auth/plugins/organization/access/statement`.
      async sendInvitationEmail(data) {
        const acceptUrl = `${env.ADMIN_URL}/accept-invitation/${data.id}`;
        const inviterName =
          data.inviter.user.name || data.inviter.user.email;
        await sendInviteEmail({
          to: data.email,
          inviterName,
          organizationName: data.organization.name,
          acceptUrl,
          role: data.role ?? "member",
        });
      },
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
