/**
 * 路由辅助层 —— 业务路由迁移到 /o/$orgSlug/p/$projectSlug/<module> 后,
 * 让所有现存调用点(Link to="/dashboard"、navigate({ to: "/shop/..." }))
 * 不需要逐个改写就能继续工作。
 *
 * 核心思路:封装 @tanstack/react-router 的 Link / useNavigate,如果传入的
 * `to` 是被迁移的扁平路径(第一段在 MOVED_TOP_SEGMENTS 里),自动:
 *   1. 拼前缀:/o/$orgSlug/p/$projectSlug/<原 path>
 *   2. 把当前 active org / project 的 slug 注入 params
 *
 * 不在 MOVED_TOP_SEGMENTS 的路径(/settings/* / /onboarding/* / /auth/*
 * / /accept-invitation/* 等)原样透传,保留原行为。
 *
 * 类型方面:wrapper 用 LinkProps + 大量 `as any` 把 TanStack Router 严格
 * 字面量 union 让出去,代价是 Link `to` 不再做 typed-routing 校验。等
 * 整套迁移稳定后,再把所有调用点改成显式 typed `to=\`/o/\$orgSlug/.../X\``
 * + 显式 params 即可恢复类型安全。
 */
import {
  Link as TSRLink,
  Navigate as TSRNavigate,
  redirect as tsrRedirect,
  useNavigate as useTSRNavigate,
} from "@tanstack/react-router"
import { forwardRef, useCallback, type ReactElement, type ReactNode } from "react"

import { useTenantParams } from "#/hooks/use-tenant-params"

// 这里我们故意不复用 @tanstack/react-router 的 LinkProps 严格字面量
// union ── 在迁移期所有调用点都按字符串传 to,严格 typed-routing 校验
// 让位给 wrapper 的运行时 prefix 注入。等后续把全部 to 改成显式
// `\`/o/\$orgSlug/p/\$projectSlug/X\`` 风格,再恢复字面量约束。
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>

const MOVED_TOP_SEGMENTS = new Set([
  "dashboard",
  "dev-patterns",
  "audit-logs",
  "event-catalog",
  "storage-box",
  "friend",
  "exchange",
  "collection",
  "check-in",
  "triggers",
  "activity",
  "entity",
  "mail",
  "character",
  "shop",
  "leaderboard",
  "offline-check-in",
  "dialogue",
  "match-squad",
  "invite",
  "friend-gift",
  "cms",
  "media-library",
  "item",
  "assist-pool",
  "task",
  "experiment",
  "level",
  "announcement",
  "rank",
  "cdkey",
  "currency",
  "end-user",
  "lottery",
  "banner",
  "analytics",
  "badge",
  "guild",
])

function isMovedFlatPath(p: unknown): p is string {
  if (typeof p !== "string") return false
  if (!p.startsWith("/")) return false
  const seg = p.split("/")[1] ?? ""
  return MOVED_TOP_SEGMENTS.has(seg)
}

/**
 * 当 useTenantParams 还没拿到 slug 时(查询期间)直接透传 to,不做改写。
 * 否则会拼出 `/o//p//dashboard` 这种空 slug 的脏 URL,触发 notFound。
 *
 * 真实场景:登录后 SignedInBouncer 即刻 navigate({ to: "/dashboard" }),
 * 但 useTenantParams 内部 useQuery 第一次还在 fetching。让 to 原样
 * 传到 TSRLink/TSRNavigate,后者会沿 fallback 到老 URL 也 not found —
 * 这是迁移期里"用户极少撞上"的边缘:登录的 SignedInBouncer 已经在
 * routes/index.tsx 里改成了 navigate 到带 slug 的嵌套 URL。
 */
function tenantReady(t: { orgSlug: string; projectSlug: string }) {
  return t.orgSlug !== "" && t.projectSlug !== ""
}

interface NavigateOpts {
  to: string
  params?: Record<string, string> | ((prev: Record<string, unknown>) => Record<string, string>)
  search?: unknown
  replace?: boolean
  hash?: string
}

function buildNested(
  to: string,
  params: NavigateOpts["params"],
  tenant: { orgSlug: string; projectSlug: string },
): {
  to: string
  params: Record<string, string> | ((prev: Record<string, unknown>) => Record<string, string>)
} {
  const newTo = `/o/$orgSlug/p/$projectSlug${to}`
  if (typeof params === "function") {
    const fn = (prev: Record<string, unknown>) => ({
      orgSlug: tenant.orgSlug,
      projectSlug: tenant.projectSlug,
      ...(params(prev) ?? {}),
    })
    return { to: newTo, params: fn }
  }
  return {
    to: newTo,
    params: {
      orgSlug: tenant.orgSlug,
      projectSlug: tenant.projectSlug,
      ...(params ?? {}),
    },
  }
}

/**
 * Link 组件包装。to 接受旧扁平路径(被迁移的业务模块)时自动转嵌套。
 *
 * Props 用 AnyProps,因为 @tanstack/react-router 的 LinkProps 在 typed
 * routing 模式下要求 to 是 union 字面量,跟我们的"接受旧路径"目的冲突。
 */
export const Link = forwardRef<HTMLAnchorElement, AnyProps & { children?: ReactNode }>(
  function Link(props, ref) {
    const tenant = useTenantParams()
    const { to, params, ...rest } = props as AnyProps
    if (isMovedFlatPath(to) && tenantReady(tenant)) {
      const built = buildNested(to as string, params, tenant)
      return (
        <TSRLink
          {...(rest as AnyProps)}
          ref={ref}
          to={built.to as never}
          params={built.params as never}
        />
      )
    }
    // 非迁移路径 — 透传给 TSRLink。这里 to/params 直接进入 TSRLink 的
    // 严格 typed-routing 检查,所以 props 仍可能在调用点报错(如果传了
    // 非法 to 字面量)。这是迁移期的取舍。
    // 非迁移路径透传给 TSRLink。这里 to/params 直接进入 TSRLink 的严格
    // typed-routing 检查,所以 props 仍可能在调用点报错。迁移期取舍。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const TSRLinkAny = TSRLink as any
    return <TSRLinkAny {...props} ref={ref} />
  },
)

/**
 * 替代 useNavigate 的 hook —— 接管 to 字符串拼前缀 + params 注入。
 *
 * 接受可选参数(对应 TanStack Router 的 useNavigate({ from: "..." }) 形态)
 * 但只透传给底层,这层包装不消费 from。
 *
 * 用法:
 *   const navigate = useNavigate()
 *   navigate({ to: "/shop/$productId", params: { productId: "abc" } })
 */
export function useNavigate(_args?: AnyProps) {
  void _args // 透传 placeholder
  const navigate = useTSRNavigate()
  const tenant = useTenantParams()
  return useCallback(
    (opts: AnyProps) => {
      if (isMovedFlatPath(opts.to) && tenantReady(tenant)) {
        const built = buildNested(
          opts.to as string,
          opts.params as NavigateOpts["params"],
          tenant,
        )
        return navigate({
          ...opts,
          to: built.to,
          params: built.params,
        } as never)
      }
      return navigate(opts as never)
    },
    [navigate, tenant],
  )
}

/**
 * Navigate 组件包装(对应 RouteGuard 等地方的声明式 redirect)。
 * 行为同 Link wrapper:to 是迁移路径就拼前缀。
 */
export function Navigate(props: AnyProps): ReactElement {
  const tenant = useTenantParams()
  const { to, params, ...rest } = props as AnyProps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TSRNavigateAny = TSRNavigate as any
  if (isMovedFlatPath(to) && tenantReady(tenant)) {
    const built = buildNested(to as string, params, tenant)
    return (
      <TSRNavigateAny
        {...rest}
        to={built.to}
        params={built.params}
      />
    )
  }
  return <TSRNavigateAny {...props} />
}

/**
 * redirect() 包装 —— 用在 beforeLoad 等服务端阶段;由于这是同步函数不
 * 能用 hook,需要从外部传入当前 params(里面应该已经包含 orgSlug/projectSlug)。
 *
 * 用法:
 *   beforeLoad: ({ params }) => {
 *     throw projectRedirect({ to: "/entity/schemas" }, params)
 *   }
 */
export function projectRedirect(
  opts: NavigateOpts,
  parentParams: AnyProps,
) {
  if (isMovedFlatPath(opts.to)) {
    return tsrRedirect({
      ...opts,
      to: `/o/$orgSlug/p/$projectSlug${opts.to}` as never,
      params: {
        orgSlug: parentParams.orgSlug as string,
        projectSlug: parentParams.projectSlug as string,
        ...((typeof opts.params === "object" ? opts.params : null) ?? {}),
      } as never,
    } as never)
  }
  return tsrRedirect(opts as never)
}

// 默认行为兜底:类型上仍接受旧扁平路径,运行时 wrapper 透明处理。
// 这意味着 Link 的 to 接受 string,而不是 typed router union ── 是这次
// 迁移期的取舍。
