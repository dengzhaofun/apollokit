import { apiKey } from "@better-auth/api-key";
import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import {
  haveIBeenPwned,
  lastLoginMethod,
  oneTap,
  openAPI,
  organization,
} from "better-auth/plugins";
import { asc, eq } from "drizzle-orm";

import { db } from "./db";
import { insertAuditRow } from "./lib/audit-log-insert";
import {
  sendInviteEmail,
  sendPasswordResetEmail,
  sendVerifyEmail,
} from "./lib/mailer";
import { normalizeEmail } from "./lib/normalize-email";
import { getTraceId } from "./lib/request-context";
import { member } from "./schema";

// Lazy via Proxy —— `betterAuth({...})` 编译 plugin chain(organization +
// apiKey + drizzle adapter + databaseHooks)是 startup CPU 大头(参见 CF
// Workers Builds 日志,startup phase 已撞 10021)。把构造延迟到首次
// `auth.handler(...)` / `auth.api.*()` 访问,startup 期不再付这笔 cost。
//
// 调用点完全不变 —— Proxy 把每次属性访问转发到 memoized 实例,函数访问
// 自动 bind target 保留 `this`。`$Infer` 等类型字段在运行时不会被访问
// (只用于 `typeof auth.$Infer.Session`),Proxy 返回 undefined 不影响。
//
// 注意:每个新加的"在顶层调用 env.X"的代码都会把 startup CPU 的水位往上
// 推一点,新加 binding 引用一律放到 `buildAdminAuth()` 内部,首次请求时
// 才解析。

/**
 * Better Auth secondaryStorage 适配器(Cloudflare KV)。
 *
 * 共享一个通用 `apollokit-kv` namespace —— 这里加 `auth:` 前缀防止与未来
 * 其他 KV 用途(Tinybird 查询缓存 `tb:`、OpenGraph 抓取 `og:`、幂等键
 * `idem:`)撞 key。Better Auth 内部的 key(rateLimit 计数 / session 缓存
 * 等)对前缀无感,统一在这层加上即可。
 */
function kvSecondaryStorage(kv: KVNamespace, prefix = "auth:") {
  return {
    get: async (key: string) => kv.get(`${prefix}${key}`),
    set: async (key: string, value: string, ttl?: number) => {
      await kv.put(
        `${prefix}${key}`,
        value,
        ttl ? { expirationTtl: ttl } : undefined,
      );
    },
    delete: async (key: string) => kv.delete(`${prefix}${key}`),
  };
}

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
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      "http://localhost:3004",
      "http://localhost:3005",
      "http://localhost:3006",
      "http://localhost:3007",
      "http://localhost:3008",
      "http://localhost:3009",
      "http://localhost:3010",
      "https://apollokit-admin.limitless-ai.workers.dev",
    ],
    // Cloudflare KV 当 secondaryStorage —— rateLimit 计数器走 KV(memory
    // 在多 isolate 间不共享、database 每请求打 Neon 太重),session 也可借
    // cookieCache+KV 减少 Neon 命中。CF KV 是最终一致(~60s 全球传播),
    // 对 session 完全 OK(cookie token 才是 source of truth);对 rateLimit
    // 是软限流(并发竞争下计数会偏低),需要硬限流时再叠 CF 内置 Rate
    // Limiting API 在边缘做第一道防线。
    secondaryStorage: kvSecondaryStorage(env.KV),
    session: {
      // 5 分钟 cookie 内嵌 cached session,过期后回源 KV/DB。Better Auth
      // 会用 secret 给 cookie 签名防篡改。
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    emailAndPassword: {
      enabled: true,
      // 测试环境(VITEST)和本地 wrangler dev 关掉强制验证:
      //   - VITEST 跑 Node + 无 EMAIL binding,sign-up 后要立刻拿 session
      //     cookie 跑业务断言。
      //   - wrangler dev 没配 RESEND/SES 密钥时验证邮件发不出去,开发体验
      //     会卡死;改用 NODE_ENV !== 'production' 一并关掉,让本地一注册
      //     就能登录。production 仍是默认的强制验证。
      requireEmailVerification:
        process.env.NODE_ENV === "production" && !process.env.VITEST,
      resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          resetUrl: url,
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerifyEmail({
          to: user.email,
          name: user.name,
          verifyUrl: url,
        });
      },
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24, // 24 hours
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: "secondary-storage",
      // 收紧敏感端点的速率 —— 默认 60s/100 是兜底,登录 / 注册 / 重置
      // 密码 / 2FA(后续接入)单独压低。Better Auth 的 customRules 按
      // 路径(相对 /api/auth)匹配。
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/forget-password": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/two-factor/*": { window: 60, max: 5 },
      },
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
      // Block compromised passwords against haveibeenpwned (k-anonymous).
      haveIBeenPwned(),
      // Cookie-only (storeInDatabase defaults false) —— daveyplate AuthView
      // 读 `better-auth.last_used_login_method` cookie 高亮上次登录方式。
      lastLoginMethod(),
      // Google One Tap —— 服务端只校验前端传来的 Google ID token,自动复用
      // socialProviders.google 的 clientId。无需新表/迁移/env。前端通过
      // authClient.oneTap() 触发 GIS 弹窗(见 admin/src/lib/auth-client.ts)。
      oneTap(),
      // Email 规范化通过下面的 databaseHooks.user.* 实现 —— 我们之前用过
      // `better-auth-harmony`,但它在顶层 import 把 validator.js + mailchecker
      // 拉进 bundle,推爆了 CF Workers startup CPU 限额(code 10021)。改用
      // src/lib/normalize-email.ts 自写的轻量版,保留 Gmail dot/plus 规则,
      // 不带 disposable-email 黑名单。auth.config.ts 里仍引 emailHarmony 用
      // 于 schema 生成(只在 Node CLI 跑,不进 worker bundle)。
      //
      // OpenAPI reference —— 暴露 `/api/auth/reference`(Scalar UI)和
      // `/api/auth/open-api/generate-schema`(OpenAPI 3.0 JSON)。仅用于本地
      // dev / staging 自查,prod 关掉 default reference UI(JSON 端点仍可
      // 取,因为 Better Auth 自身/admin agent 可能消费它);如果要在 prod
      // 也看 UI,可以另外在 `src/index.ts` 给 `/api/auth/reference` 套
      // `requireAdminOrApiKey` 门禁,这里不强加。
      //
      // 不要把生成的 spec 合并到 SDK 管线 —— 我们的 SDK 是 hey-api 从
      // openapi.json 生成,auth 路由有意不进 SDK(前端走 better-auth/client,
      // server-to-server 走 ak_ apiKey)。两套 spec 平行存在即可。
      openAPI({
        disableDefaultReference: process.env.NODE_ENV === "production",
      }),
    ],
    hooks: {
      // Endpoint 层钩子。监听两类路径:
      //
      //   1. `/sign-out` / `/revoke-session*` —— sign-out / 撤销其他会话。
      //      Better Auth `internalAdapter.deleteSession` 在 secondaryStorage
      //      模式 + `!storeSessionInDatabase` 时**早返回不走 deleteWithHooks**,
      //      所以 `databaseHooks.session.delete.after` 永远不触发(我们的项目
      //      正好命中这条 —— KV secondaryStorage on + 默认不写 DB)。endpoint
      //      钩子是这条路径的唯一审计入口。
      //
      //   2. `/api-key/{create,update,delete}` —— `@better-auth/api-key` plugin
      //      管理自己的表,databaseHooks 没暴露 apiKey 实体钩子,只能在 endpoint
      //      层挂。
      //
      // ctx.path 已经是相对 basePath 的路径(/sign-out / /api-key/create 等),
      // /api/auth 前缀由我们这里手动补全到 audit_logs.path 列。
      after: createAuthMiddleware(async (ctx) => {
        const path = ctx.path;
        if (typeof path !== "string") return;

        const session = ctx.context.session as
          | {
              user?: { id?: string; email?: string | null };
              session?: {
                id?: string;
                activeOrganizationId?: string | null;
              };
            }
          | null
          | undefined;
        const userId = session?.user?.id ?? null;
        const orgId = session?.session?.activeOrganizationId ?? null;
        const returned = ctx.context.returned;
        const requestHeaders = (ctx as { headers?: Headers }).headers;

        const baseRow = {
          organizationId: orgId,
          actorType: "user" as const,
          actorId: userId,
          actorLabel: session?.user?.email ?? null,
          method: "POST",
          status: 200,
          ip: requestHeaders?.get("cf-connecting-ip") ?? null,
          userAgent: requestHeaders?.get("user-agent") ?? null,
          traceId: getTraceId() || null,
        };

        // ── sign-out / session 撤销 ───────────────────────────────────
        if (path === "/sign-out") {
          // returned: { success: true } 或 APIError
          if ((returned as { success?: boolean } | null)?.success !== true) {
            return;
          }
          // 注意:Better Auth `/sign-out` handler 不走 sessionMiddleware
          // (它直接 ctx.getSignedCookie + internalAdapter.deleteSession),
          // 所以 ctx.context.session 在 hooks.after 时为 null —— actor_id /
          // org_id 这里都是 null。已删的 session 拿不到 userId,审计行
          // 仍记 path / ip / ua 留痕。要补 actor_id 需要 hooks.before 阶段
          // 解 cookie 查 internalAdapter.findSession,跨阶段传递走 ALS,留作
          // follow-up。
          await insertAuditRow({
            ...baseRow,
            resourceType: "auth:session",
            resourceId: null,
            resourceLabel: null,
            action: "auth:sign_out",
            path: "/api/auth/sign-out",
          });
          return;
        }

        if (path === "/revoke-session" || path === "/revoke-other-sessions") {
          if ((returned as { success?: boolean } | null)?.success !== true) {
            return;
          }
          await insertAuditRow({
            ...baseRow,
            resourceType: "auth:session",
            resourceId: null,
            resourceLabel: null,
            action: "auth:session_revoked",
            path: `/api/auth${path}`,
          });
          return;
        }

        // ── api-key plugin endpoints ─────────────────────────────────
        if (path === "/api-key/create") {
          // 失败路径(rateLimit / 校验失败)returned 是 APIError,不带 id;
          // 只在拿到 id 时记一次 create 审计行。
          if (
            !returned ||
            typeof returned !== "object" ||
            !("id" in returned)
          ) {
            return;
          }
          const created = returned as {
            id: string;
            name?: string | null;
            prefix?: string | null;
          };
          await insertAuditRow({
            ...baseRow,
            resourceType: "auth:api_key",
            resourceId: created.id,
            resourceLabel: created.name ?? created.prefix ?? null,
            action: "auth:api_key_create",
            path: "/api/auth/api-key/create",
          });
          return;
        }

        if (path === "/api-key/delete") {
          const body = (ctx.body ?? {}) as { keyId?: string };
          const success =
            (returned as { success?: boolean } | null)?.success === true;
          if (!success || !body.keyId) return;
          await insertAuditRow({
            ...baseRow,
            resourceType: "auth:api_key",
            resourceId: body.keyId,
            resourceLabel: null,
            action: "auth:api_key_delete",
            path: "/api/auth/api-key/delete",
          });
          return;
        }

        if (path === "/api-key/update") {
          const body = (ctx.body ?? {}) as { keyId?: string };
          if (!returned || typeof returned !== "object" || !body.keyId) {
            return;
          }
          const updated = returned as { name?: string | null };
          await insertAuditRow({
            ...baseRow,
            resourceType: "auth:api_key",
            resourceId: body.keyId,
            resourceLabel: updated.name ?? null,
            action: "auth:api_key_update",
            path: "/api/auth/api-key/update",
          });
          return;
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // 写入 user.normalized_email —— 替代被踢出 bundle 的 emailHarmony
            // 的运行时部分。UNIQUE 约束(见 drizzle/0007)阻同邮箱多账号。
            return {
              data: {
                ...user,
                normalizedEmail: normalizeEmail(user.email),
              },
            };
          },
          after: async (user, ctx) => {
            // sign-up 落 audit_logs。这一刻用户尚未加入任何 org —— 列已设为
            // nullable(见 schema/audit-log.ts),audit row organizationId=null。
            await insertAuditRow({
              organizationId: null,
              actorType: "user",
              actorId: user.id,
              actorLabel: user.email,
              resourceType: "auth:user",
              resourceId: user.id,
              resourceLabel: user.email,
              action: "auth:sign_up",
              ...ctxRequestFields(ctx),
              traceId: getTraceId() || null,
            });
          },
        },
        update: {
          before: async (user) => {
            // 用户改 email 时跟着更新 normalized_email。Better Auth 在 update
            // 钩子里只把"将变更的字段"传过来,所以仅当 email 出现时计算。
            if (typeof user.email === "string") {
              return {
                data: {
                  ...user,
                  normalizedEmail: normalizeEmail(user.email),
                },
              };
            }
            // 没改 email 就 no-op,保持原值。
            return;
          },
        },
      },
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
          after: async (session, ctx) => {
            // sign-in 落 audit_logs。session 已经被上面 before 写过了
            // activeOrganizationId,这里直接读。
            const orgId = (session as { activeOrganizationId?: string | null })
              .activeOrganizationId;
            await insertAuditRow({
              organizationId: orgId ?? null,
              actorType: "user",
              actorId: session.userId,
              actorLabel: null,
              resourceType: "auth:session",
              resourceId: session.id,
              resourceLabel: null,
              action: "auth:sign_in",
              ...ctxRequestFields(ctx),
              traceId: getTraceId() || null,
            });
          },
        },
        // 注意:**没有** session.delete.after —— Better Auth 在 KV
        // secondaryStorage(我们启用)+ 默认不写 DB 的组合下,deleteSession
        // 早返回不进 deleteWithHooks,databaseHooks 不会被调用。sign-out /
        // revoke-session 的审计走上面 `hooks.after` 的 endpoint 钩子。
      },
      account: {
        create: {
          after: async (account, ctx) => {
            // OAuth 链接 / credential account 初始化 都会触发。
            // providerId === "credential" 是邮箱密码账号被设置(通常伴随
            // sign-up,本身价值不大);其他 provider("google" 等)是社交账号
            // 链接,有审计价值。
            if (account.providerId === "credential") return;
            await insertAuditRow({
              organizationId: null,
              actorType: "user",
              actorId: account.userId,
              actorLabel: null,
              resourceType: "auth:account",
              resourceId: account.id,
              resourceLabel: account.providerId,
              action: "auth:account_link",
              ...ctxRequestFields(ctx),
              traceId: getTraceId() || null,
              metadata: { providerId: account.providerId },
            });
          },
        },
        update: {
          after: async (account, ctx) => {
            // Better Auth 把 account.update 用于:
            //   - 密码变更(providerId === "credential" 且 password 字段变化)
            //   - OAuth token 刷新(其他 providerId,accessToken/refreshToken 变化)
            // 我们只关心密码变更,token 刷新太频繁不留痕。
            //
            // 注意 update hook 收到的是"将变更的字段",providerId 可能不在
            // payload 里。两路兼容:有 password 变化就当密码变更记录。
            const hasPasswordChange =
              "password" in account &&
              typeof (account as { password?: unknown }).password === "string";
            if (!hasPasswordChange) return;
            await insertAuditRow({
              organizationId: null,
              actorType: "user",
              actorId: (account as { userId?: string }).userId ?? null,
              actorLabel: null,
              resourceType: "auth:account",
              resourceId:
                (account as { id?: string }).id ?? null,
              resourceLabel: "credential",
              action: "auth:password_change",
              ...ctxRequestFields(ctx),
              traceId: getTraceId() || null,
            });
          },
        },
      },
    },
  });
}

/**
 * 从 Better Auth `databaseHooks.*.after` 的 `context` 参数里提取 method /
 * path / status / ip / userAgent 五段,沉默处理 null context (e.g. CLI seed
 * 走 InternalAdapter 直写,不带 endpoint context)。
 *
 * 返回的 status 是"hook 触发那一刻"的快照 —— Better Auth 在路由 handler
 * 里 throw 之前完成数据库写,所以走到 after 通常意味着核心写已成功。我们
 * 一律记 200,异常路径(写完 hook 但路由后续 throw)不在审计目标之列(那
 * 种状态由 Tinybird `http_requests` 留痕)。
 */
function ctxRequestFields(ctx: unknown): {
  method: string;
  path: string;
  status: number;
  ip: string | null;
  userAgent: string | null;
} {
  const c = ctx as
    | {
        path?: string;
        method?: string;
        request?: Request;
        headers?: Headers;
      }
    | null;
  const headers: Headers | undefined = c?.headers ?? c?.request?.headers;
  return {
    method: c?.method ?? c?.request?.method ?? "POST",
    path: c?.path ? `/api/auth${c.path}` : "/api/auth/unknown",
    status: 200,
    ip: headers?.get("cf-connecting-ip") ?? null,
    userAgent: headers?.get("user-agent") ?? null,
  };
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
