/**
 * apollokit admin 私有 pattern 组件层。
 *
 * - 区别于 ui/(shadcn 通用原语):patterns 是组合 + 业务语义的"页面级"组件
 * - Phase 2 沉淀的部分;Phase 3 开始铺到 dashboard / activity / settings
 * - 改造原则:每个 pattern 都该让一类页面少 30+ 行重复代码
 */

export { PageShell, PageHeader, PageBody, PageSection } from "./PageShell"
export type { PageHeaderProps } from "./PageShell"

export { StatCard, StatGrid } from "./StatCard"
export type { StatCardProps, DeltaInfo } from "./StatCard"

export {
  EmptyList,
  EmptySearch,
  ErrorState,
  UnauthorizedState,
  ComingSoon,
} from "./EmptyStates"

export { DetailHeader, DetailLayout } from "./DetailHeader"
export type { DetailHeaderProps, MetaItem } from "./DetailHeader"
