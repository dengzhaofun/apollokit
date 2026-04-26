import {
  ConsentBanner,
  ConsentDialog,
  ConsentManagerProvider,
  useConsentManager,
} from "@c15t/react"

import { Button } from "#/components/ui/button"

/*
 * c15t consent layer —— 全站挂在 __root.tsx 顶层。
 *
 * mode: 'offline' —— 不打 c15t 后端,localStorage 持久化。够用,因为我们没有
 * 第三方追踪 / 广告 / 分析脚本要按类别拦截,Tinybird 是 server 侧一方日志。
 *
 * initialConsentCategories: ['necessary', 'functionality'] —— 站点实际只设
 * 4 个 cookie/存储项(Better Auth session、PARAGLIDE_LOCALE、sidebar_state、
 * theme localStorage),全部对应这两类。其它 measurement / marketing /
 * experience 默认关闭,banner 也不会展示对应开关。
 *
 * 升级路径:以后接入 GA / PostHog / Stripe / IAB 广告时,把 mode 切到 'hosted'
 * 或部署 @c15t/backend 自托管,加对应 category 即可,无需改前端组件。
 */
export function ConsentLayer({ children }: { children: React.ReactNode }) {
  return (
    <ConsentManagerProvider
      options={{
        mode: "offline",
        store: {
          initialConsentCategories: ["necessary", "functionality"],
        },
      }}
    >
      {children}
      <ConsentBanner />
      <ConsentDialog />
    </ConsentManagerProvider>
  )
}

/*
 * 页脚 "Cookie 设置" 按钮 —— 强制重开 dialog,即使用户已经做过选择。
 * 必须挂在 <ConsentManagerProvider> 子树内才能用 useConsentManager。
 */
export function ConsentSettingsButton({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const { setActiveUI } = useConsentManager()
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className={className}
      onClick={() => setActiveUI("dialog", { force: true })}
    >
      {children}
    </Button>
  )
}
