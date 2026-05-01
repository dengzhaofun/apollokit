import { AuthView } from "@daveyplate/better-auth-ui"
import { createFileRoute } from "@tanstack/react-router"
import { ShieldCheckIcon, SparklesIcon, ZapIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { authClient } from "#/lib/auth-client"
import { seo } from "#/lib/seo"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/auth/$authView")({
  // 登录/注册/重置密码链路全部 noindex,避免回调 URL 的 token 参数被索引。
  head: () => seo({ title: "Sign in", noindex: true }),
  component: AuthViewPage,
})

/*
 * 登录 / 注册 / 重置密码 —— 商业 SaaS 双栏:
 *   - 左 50%(>=lg)只在桌面显示 brand hero(渐变底 + logo + slogan + 卖点)
 *   - 右 50% 表单
 *
 * 移动端只显示右栏(hero 折叠隐藏),保持原 max-w-md 居中表单的简洁体验。
 *
 * AuthView 来自 @daveyplate/better-auth-ui,根据 authView 参数自动渲染
 * sign-in / sign-up / forgot-password 等不同表单。我们外包一层 brand chrome。
 */
function AuthViewPage() {
  const { authView } = Route.useParams()

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* 左侧 brand hero —— 仅 lg+ 显示 */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[oklch(0.30_0.18_290)] via-[oklch(0.20_0.12_270)] to-[oklch(0.15_0.05_250)] lg:flex lg:flex-col lg:justify-between lg:p-12 lg:text-white">
        {/* 装饰性背景纹理:发光圆 */}
        <div
          aria-hidden
          className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[oklch(0.67_0.22_290)] opacity-30 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-[oklch(0.55_0.20_250)] opacity-25 blur-3xl"
        />

        {/* 顶部:logo + 产品名 */}
        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center overflow-hidden rounded-lg bg-white shadow-lg shadow-black/30">
            <img src="/logo192.png" alt="ApolloKit" className="size-full object-contain" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">
              ApolloKit
            </div>
            <div className="text-xs text-white/60">
              {t("游戏运营 SaaS", "Game Ops SaaS")}
            </div>
          </div>
        </div>

        {/* 中部:主 slogan + 卖点 */}
        <div className="relative space-y-8">
          <h1 className="max-w-md text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
            {t(
              "把游戏运营搬上 SaaS,从活动到商城,一站式接管。",
              "Run game operations on SaaS — from activities to shops, all in one stack.",
            )}
          </h1>

          <ul className="space-y-4 text-sm text-white/80">
            <li className="flex items-start gap-3">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10">
                <ZapIcon className="size-4" />
              </div>
              <div>
                <div className="font-medium text-white">
                  {t("活动 / 商城 / 任务一体化", "Activities / Shop / Tasks unified")}
                </div>
                <div className="text-xs text-white/60">
                  {t(
                    "Battle Pass、礼包、签到、抽奖、排行榜、玩家等级 — 所有运营场景开箱即用",
                    "Battle Pass, gifts, check-in, lottery, leaderboards, levels — all out of the box.",
                  )}
                </div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10">
                <ShieldCheckIcon className="size-4" />
              </div>
              <div>
                <div className="font-medium text-white">
                  {t("企业级权限 + i18n", "Enterprise auth + i18n")}
                </div>
                <div className="text-xs text-white/60">
                  {t(
                    "Better Auth 多项目 + API Keys + Webhooks + 中英双语",
                    "Better Auth + multi-project + API Keys + Webhooks + zh/en.",
                  )}
                </div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10">
                <SparklesIcon className="size-4" />
              </div>
              <div>
                <div className="font-medium text-white">
                  {t("Tinybird 实时分析", "Tinybird real-time analytics")}
                </div>
                <div className="text-xs text-white/60">
                  {t(
                    "请求 / 错误率 / DAU / 活动参与 全链路数据闭环",
                    "Requests / errors / DAU / engagement — full data loop, real-time.",
                  )}
                </div>
              </div>
            </li>
          </ul>
        </div>

        {/* 底部:版权 / 链接 */}
        <div className="relative flex items-center justify-between text-xs text-white/50">
          <span>© 2026 ApolloKit</span>
          <div className="flex gap-4">
            <a href="/privacy" className="hover:text-white">
              {t("隐私", "Privacy")}
            </a>
            <a href="/terms" className="hover:text-white">
              {t("条款", "Terms")}
            </a>
          </div>
        </div>
      </aside>

      {/* 右侧:表单 —— 移动端全宽,桌面右半 */}
      <div className="flex w-full flex-col items-center justify-center px-4 py-14">
        <div className="w-full max-w-md">
          {/* 移动端 logo —— lg 隐藏(左 hero 已有) */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex size-8 items-center justify-center overflow-hidden rounded-md">
              <img src="/logo192.png" alt="ApolloKit" className="size-full object-contain" />
            </div>
            <span className="text-base font-semibold tracking-tight">
              ApolloKit
            </span>
          </div>
          <AuthView pathname={authView} />
          <OneTapTrigger authView={authView} />
        </div>
      </div>
    </main>
  )
}

/**
 * Google One Tap 触发器。
 *
 * 1. 仅在 sign-in / sign-up 视图触发,其他视图(forgot-password / verify-email
 *    等)跳过 —— 这些路径用户多半已知道账号,弹 One Tap 是噪音。
 * 2. 已登录态跳过,避免在已登录用户撞回登录页时再弹。
 * 3. 同 SignedInBouncer 的 SSR 防御模式:外层 mounted-gate,`useSession`
 *    只在客户端 hydration 后跑(better-auth/react 的 store 在 Vite SSR
 *    下有双 React 实例风险,见 routes/index.tsx 注释)。
 * 4. UI 不会被 GIS 失败阻塞 —— `<AuthView>` 自带的邮箱/密码 + Google 按钮
 *    永远是 fallback。
 */
function OneTapTrigger({ authView }: { authView: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  if (!mounted) return null
  if (authView !== "sign-in" && authView !== "sign-up") return null
  return <OneTapTriggerClient />
}

function OneTapTriggerClient() {
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (isPending) return
    if (session?.user) return
    void authClient.oneTap({
      callbackURL: "/dashboard",
      onPromptNotification: (notification) => {
        // GIS 弹窗被用户关闭/跳过/达到 maxAttempts —— 仅 warn,UI 上 AuthView
        // 自带的 Google 按钮就是 fallback。
        console.warn("[oneTap] dismissed/skipped", notification)
      },
    })
  }, [isPending, session?.user])

  return null
}
