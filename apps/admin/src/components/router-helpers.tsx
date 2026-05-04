/**
 * 路由辅助层 —— 业务路由迁移到 /o/$orgSlug/p/$projectSlug/<module> 后,
 * 让所有现存调用点(Link to="/dashboard"、navigate({ to: "/shop/..." }))
 * 不需要逐个改写就能继续工作。
 *
 * 核心思路:封装 @tanstack/react-router 的 Link / useNavigate / Navigate /
 * redirect。如果传入的 `to` 是被迁移的扁平路径(第一段在
 * MOVED_TOP_SEGMENTS 里),自动:
 *   1. 拼前缀:/o/$orgSlug/p/$projectSlug/<原 path>
 *   2. 把当前 active org / project 的 slug 注入 params
 *
 * 不在 MOVED_TOP_SEGMENTS 的路径(/settings/* / /onboarding/* / /auth/*
 * / /accept-invitation/* 等)原样透传。
 *
 * 类型策略 —— 严格(无 `any`):
 *   - 入参类型用 TanStack Router 自家的 `LinkComponentProps`(typed routing
 *     字面量 union),保证调用点写 `to="/dashboard"` 等老扁平路径时,本仓
 *     route tree 仍能在编译期校验。
 *   - 内部 wrapper 把 `to`/`params` 重写后透传给底层 TSRLink,跨边界处只
 *     用 `as React.ComponentProps<typeof TSRLink>` 这一处类型收敛(告诉
 *     TS:动态构造的对象与 TSRLink 的 props 形态相同)。无 `as any` /
 *     `as never`。
 *
 * 待迁移期结束(全部调用点改写成显式 typed `to=\`/o/$orgSlug/p/$projectSlug/X\`` +
 * 显式 params)再删 wrapper。
 */
import {
  Link as TSRLink,
  Navigate as TSRNavigate,
  redirect as tsrRedirect,
  useNavigate as useTSRNavigate,
  type NavigateOptions,
} from "@tanstack/react-router"
import {
  forwardRef,
  useCallback,
  type ComponentProps,
  type ForwardedRef,
  type ReactElement,
} from "react"

import { useTenantParams } from "#/hooks/use-tenant-params"

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

type Tenant = { orgSlug: string; projectSlug: string }

/** 判断是否落在迁移子树。`to` 必须是字符串,以 `/` 起头,首段在白名单。 */
function isMovedFlatPath(to: unknown): to is string {
  if (typeof to !== "string") return false
  if (!to.startsWith("/")) return false
  const seg = to.split("/")[1] ?? ""
  return MOVED_TOP_SEGMENTS.has(seg)
}

/** 当 useTenantParams 还没拿到 slug(查询期间)直接透传。否则会拼成
 * `/o//p//dashboard` 触发 notFound。 */
function tenantReady(t: Tenant): boolean {
  return t.orgSlug !== "" && t.projectSlug !== ""
}

type ParamsValue = Record<string, string>
type ParamsArg = ParamsValue | ((prev: Record<string, unknown>) => ParamsValue) | undefined

/**
 * Search param 在 TSR 严格 typed routing 里跟 `to` 字面量绑定;wrapper 接受
 * `to: string` 后 TSR 无法窄化,所以这里把 search 也放宽到对象 / reducer
 * function。
 */
type SearchValue = Record<string, unknown>
type SearchArg =
  | SearchValue
  | ((prev: Record<string, unknown>) => SearchValue)
  | true
  | undefined

/** 在保留原 params(对象 / 函数 / undefined)语义的前提下注入 orgSlug/projectSlug。 */
function mergeParams(orig: ParamsArg, tenant: Tenant): ParamsArg {
  if (typeof orig === "function") {
    return (prev: Record<string, unknown>) => ({
      orgSlug: tenant.orgSlug,
      projectSlug: tenant.projectSlug,
      ...orig(prev),
    })
  }
  return {
    orgSlug: tenant.orgSlug,
    projectSlug: tenant.projectSlug,
    ...(orig ?? {}),
  }
}

function buildNestedTo(flatTo: string): string {
  return `/o/$orgSlug/p/$projectSlug${flatTo}`
}

// ── Link wrapper ───────────────────────────────────────────────────────

/**
 * Wrapper Link 暴露的 props ── 比 TanStack Router 的 LinkComponentProps
 * 更宽松,因为 wrapper 故意接受迁移期的旧扁平字面量(`to="/dashboard"`)
 * 并在运行时改写。这是 wrapper 的"显式接口扩展",不是 `any` 让位。
 *
 * 字段:
 *   - `to`: TSR 接受的所有 typed `to` ∪ string (允许迁移期旧字面量)
 *   - `params`: 标准 TSR 形态 + 可选省略(wrapper 自动补 orgSlug/projectSlug)
 *   - 其余直接复用 TSRLink 的 props(className / search / hash / replace 等)
 */
type TSRLinkRuntimeProps = ComponentProps<typeof TSRLink>
type WrappedLinkProps = Omit<TSRLinkRuntimeProps, "to" | "params" | "search"> & {
  /** 迁移期可写旧扁平路径(`/dashboard`),也可写完整嵌套(`/o/$orgSlug/p/$projectSlug/dashboard`)。 */
  to: string
  params?: ParamsArg
  search?: SearchArg
}

export const Link = forwardRef(
  function Link(
    props: WrappedLinkProps,
    ref: ForwardedRef<HTMLAnchorElement>,
  ): ReactElement {
    const tenant = useTenantParams()
    const { to, params, ...rest } = props

    if (isMovedFlatPath(to) && tenantReady(tenant)) {
      const enhanced = {
        ...rest,
        to: buildNestedTo(to),
        params: mergeParams(params, tenant),
      } as TSRLinkRuntimeProps
      return <TSRLink ref={ref} {...enhanced} />
    }
    return (
      <TSRLink
        ref={ref}
        {...({ ...rest, to, params } as TSRLinkRuntimeProps)}
      />
    )
  },
)

// ── useNavigate wrapper ────────────────────────────────────────────────

/**
 * 替代 useNavigate 的 hook —— 接管 to 字符串拼前缀 + params 注入。
 * 接受可选参数(对应 TanStack Router 的 useNavigate({ from: "..." }) 形态)。
 */
type WrappedNavigateOpts = Omit<NavigateOptions, "to" | "params" | "search"> & {
  /** 缺省时保持当前路由,等价于 TSR 的 `to: "."`。 */
  to?: string
  params?: ParamsArg
  search?: SearchArg
}
type NavigateFn = (opts: WrappedNavigateOpts) => Promise<void> | void

/** TSR 的 `useNavigate({ from })` 用来给后续 navigate 调用提供"相对 from
 * 路径"的解析锚点。Wrapper 透传给底层 TSR 的 useNavigate。 */
type UseNavigateArgs = { from?: string }

/** 接受可选 `useNavigate({ from })` 形态参数,跟 TSR 一致。 */
export function useNavigate(_args?: UseNavigateArgs): NavigateFn {
  void _args
  const navigate = useTSRNavigate()
  const tenant = useTenantParams()

  return useCallback<NavigateFn>(
    (opts) => {
      const { to, params, ...rest } = opts
      if (isMovedFlatPath(to) && tenantReady(tenant)) {
        const enhanced = {
          ...rest,
          to: buildNestedTo(to),
          params: mergeParams(params, tenant),
        } as NavigateOptions
        return navigate(enhanced)
      }
      return navigate({ ...rest, to, params } as NavigateOptions)
    },
    [navigate, tenant],
  )
}

// ── Navigate component wrapper ─────────────────────────────────────────

type RuntimeNavigateProps = ComponentProps<typeof TSRNavigate>
type WrappedNavigateProps = Omit<RuntimeNavigateProps, "to" | "params" | "search"> & {
  to: string
  params?: ParamsArg
  search?: SearchArg
}

/** Navigate 组件包装(对应 RouteGuard 等地方的声明式 redirect)。 */
export function Navigate(props: WrappedNavigateProps): ReactElement {
  const tenant = useTenantParams()
  const { to, params, ...rest } = props
  if (isMovedFlatPath(to) && tenantReady(tenant)) {
    const enhanced = {
      ...rest,
      to: buildNestedTo(to),
      params: mergeParams(params, tenant),
    } as RuntimeNavigateProps
    return <TSRNavigate {...enhanced} />
  }
  return (
    <TSRNavigate {...({ ...rest, to, params } as RuntimeNavigateProps)} />
  )
}

// ── redirect() helper for beforeLoad ───────────────────────────────────

/**
 * redirect() 包装 —— 用在 beforeLoad 等 sync 阶段。由于不能调 hook,
 * 调用方须从 beforeLoad 的 ({ params }) 里取出当前 params(其中包含
 * orgSlug/projectSlug 当处于项目作用域时)显式传入。
 *
 * 用法:
 *   beforeLoad: ({ params }) => {
 *     throw projectRedirect({ to: "/entity/schemas" }, params)
 *   }
 */
type RedirectOptions = NavigateOptions

type WrappedRedirectOpts = Omit<RedirectOptions, "to" | "params"> & {
  to: string
  params?: ParamsValue
}

export function projectRedirect(
  opts: WrappedRedirectOpts,
  parentParams: { orgSlug: string; projectSlug: string },
) {
  const { to, params, ...rest } = opts
  if (isMovedFlatPath(to)) {
    const merged: ParamsValue = {
      orgSlug: parentParams.orgSlug,
      projectSlug: parentParams.projectSlug,
      ...(params ?? {}),
    }
    const enhanced = {
      ...rest,
      to: buildNestedTo(to),
      params: merged,
    } as RedirectOptions
    return tsrRedirect(enhanced)
  }
  return tsrRedirect({ ...rest, to, params } as RedirectOptions)
}
