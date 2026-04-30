import { apiKey } from "@better-auth/api-key";
import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { asc, eq } from "drizzle-orm";

import { db } from "./db";
import { sendInviteEmail } from "./lib/mailer";
import { member } from "./schema";

// Lazy via Proxy —— `betterAuth({...})` 编译 plugin chain(organization +
// apiKey + drizzle adapter + databaseHooks)是 startup CPU 大头(参见 CF
// Workers Builds 日志,startup phase 已撞 10021)。把构造延迟到首次
// `auth.handler(...)` / `auth.api.*()` 访问,startup 期不再付这笔 cost。
//
// 调用点完全不变 —— Proxy 把每次属性访问转发到 memoized 实例,函数访问
// 自动 bind target 保留 `this`。`$Infer` 等类型字段在运行时不会被访问
// (只用于 `typeof auth.$Infer.Session`),Proxy 返回 undefined 不影响。
function buildAdminAuth() {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // admin 通过 service binding 转发 /api/* 到 server,但转发时 Request
    // 原封不动透传,Origin header 仍是浏览器最初设的 admin URL —— Better
    // Auth 依 trustedOrigins 校验敏感操作(sign-in/up/session)的 Origin,
    // 所以 admin 的 prod URL 和 dev URL 都要列出。
    trustedOrigins: [
      "http://localhost:3000",
      "https://apollokit-admin.limitless-ai.workers.dev",
    ],
    emailAndPassword: {
      enabled: true,
    },
    // Google OAuth —— redirectURI 默认 `${baseURL}/api/auth/callback/google`,
    // baseURL 来自 BETTER_AUTH_URL,必须是 admin domain(浏览器从 Google 域
    // 直跳回 callback,cookie 种在该 host 下;走 service binding/vite proxy
    // 的 same-origin 模型要求 cookie 落在 admin 域)。Google 后台的
    // Authorized redirect URIs 也按 admin domain 配。
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
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
}

type AdminAuth = ReturnType<typeof buildAdminAuth>;

let _auth: AdminAuth | null = null;
function resolveAuth(): AdminAuth {
  if (!_auth) _auth = buildAdminAuth();
  return _auth;
}

export const auth = new Proxy({} as AdminAuth, {
  get(_target, prop, receiver) {
    const target = resolveAuth() as unknown as Record<
      string | symbol,
      unknown
    >;
    const value = target[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(target);
    }
    return value;
  },
  has(_target, prop) {
    return prop in (resolveAuth() as unknown as object);
  },
});
