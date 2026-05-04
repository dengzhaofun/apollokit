import { createFileRoute } from "@tanstack/react-router"
import {
  ActivityIcon,
  CalendarIcon,
  CircleAlertIcon,
  CoinsIcon,
  PlusIcon,
  StarIcon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  ComingSoon,
  DetailHeader,
  DetailLayout,
  EmptyList,
  EmptySearch,
  ErrorState,
  PageBody,
  PageHeader,
  PageSection,
  PageShell,
  StatCard,
  StatGrid,
  UnauthorizedState,
} from "#/components/patterns"

/*
 * Dev-only:Phase 2 模式组件 playground。
 * 不是面向用户的页面,目的是让开发能一眼把所有 pattern 看全,确认每个 token /
 * 间距 / 状态(loading/error/zh/en/dark/light)都对得上 mockup。
 *
 * URL: /dev-patterns(authenticated)
 * 部署到 prod 是无害的,但通常不建议放进 navigation。
 */

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/dev-patterns")({
  component: PatternsDevPage,
})

function PatternsDevPage() {
  return (
    <PageShell>
      <PageHeader
        icon={<ZapIcon className="size-5" />}
        title="Patterns playground"
        description="Phase 2 沉淀的模式组件,所有变体一次看全。Dev-only,不应进入面向用户的导航。"
        badge={<Badge variant="secondary">Dev</Badge>}
        actions={
          <>
            <Button variant="outline" size="sm">
              查看代码
            </Button>
            <Button size="sm">
              <PlusIcon />
              示意按钮
            </Button>
          </>
        }
      />

      <PageBody>
        {/* StatCard / StatGrid */}
        <PageSection
          title="StatCard / StatGrid"
          description="指标卡 + 4 列响应式网格,带 sparkline / delta / loading / error 四态"
        >
          <StatGrid columns={4}>
            <StatCard
              icon={UsersIcon}
              label="DAU · 日活玩家"
              value="128,492"
              delta={{ value: 12.4, label: "vs last week" }}
              trend={[44, 52, 48, 60, 58, 67, 72, 80, 78, 88, 95]}
              trendColor="var(--success)"
            />
            <StatCard
              icon={CoinsIcon}
              label="MRR · 月度营收"
              value="¥482K"
              delta={{ value: 8.7, label: "vs last month" }}
              trend={[20, 28, 35, 32, 40, 48, 52, 60, 65, 72, 78]}
              trendColor="var(--brand)"
            />
            <StatCard
              icon={StarIcon}
              label="活跃活动"
              value="24"
              delta={{ value: 3, label: "new this week", formatter: (v) => `+${v}` }}
              trend={[10, 12, 11, 14, 13, 15, 17, 18, 20, 21, 24]}
              trendColor="var(--warning)"
            />
            <StatCard
              icon={CircleAlertIcon}
              label="错误率 · Error rate"
              value="0.04%"
              delta={{
                value: -18.2,
                label: "improving",
                intent: "inverted",
              }}
              trend={[1.2, 0.9, 1.1, 0.7, 0.5, 0.4, 0.3, 0.25, 0.18, 0.1, 0.04]}
              trendColor="var(--destructive)"
            />
          </StatGrid>

          <StatGrid columns={4} className="mt-2">
            <StatCard label="Loading 态" value="—" loading />
            <StatCard
              icon={TrendingUpIcon}
              label="Error 态"
              value="—"
              error
            />
            <StatCard
              icon={ActivityIcon}
              label="无 delta + 无 sparkline"
              value="—"
            />
            <StatCard
              icon={UsersIcon}
              label="带 hint"
              value="2,481"
              hint={<span className="text-xs">UTC+8</span>}
              delta={{ value: 0, label: "持平", intent: "neutral" }}
            />
          </StatGrid>
        </PageSection>

        {/* DetailHeader / DetailLayout */}
        <PageSection
          title="DetailHeader / DetailLayout"
          description="详情页头 + 两栏布局,替代 activity/$alias 散落手写"
        >
          <div className="rounded-lg border bg-card p-6">
            <DetailHeader
              icon={<StarIcon className="size-6" />}
              title="春节限定礼包活动"
              subtitle="spring-2026-pack"
              status={
                <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/15">
                  ● Active · 进行中
                </Badge>
              }
              meta={[
                {
                  icon: <CalendarIcon />,
                  label: "02-08 ~ 02-22 · 14 天",
                },
                {
                  icon: <UserIcon />,
                  label: "Samuel Deng",
                  key: "创建人",
                },
                {
                  icon: <ActivityIcon />,
                  label: "2 分钟前",
                  key: "最近更新",
                },
              ]}
              actions={
                <>
                  <Button variant="outline" size="sm">
                    Duplicate
                  </Button>
                  <Button size="sm">编辑</Button>
                </>
              }
            />
            <div className="mt-6 border-t pt-4">
              <DetailLayout
                side={
                  <>
                    <div className="rounded-lg border bg-card p-4 text-sm">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                        Status
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">State</span>
                        <span className="text-success">● Active</span>
                      </div>
                    </div>
                    <div className="rounded-lg border bg-card p-4 text-sm">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                        Linked
                      </div>
                      <div className="text-muted-foreground">
                        8 商品 · 3 任务 · 1 公告
                      </div>
                    </div>
                  </>
                }
              >
                <div className="rounded-lg border bg-card p-4 text-sm">
                  <p className="text-muted-foreground">
                    主体区:这里在真实页面里放 Tabs / 配置表 / 趋势图 / Members
                    列表等。
                  </p>
                </div>
              </DetailLayout>
            </div>
          </div>
        </PageSection>

        {/* EmptyStates */}
        <PageSection
          title="Empty states"
          description="5 种预制空态 —— 列表无数据 / 搜索无结果 / 加载失败 / 未授权 / 敬请期待"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <EmptyList
              title="还没有活动"
              description="创建第一个活动,触达你的玩家"
              action={
                <Button size="sm">
                  <PlusIcon />
                  新建活动
                </Button>
              }
            />
            <EmptySearch
              query="春节"
              onClear={() => {
                /* demo */
              }}
            />
            <ErrorState
              error={
                new Error(
                  '{"error": "invalid authentication token. Invalid token b:eyJhbGciOiJ..."}'
                )
              }
              onRetry={() => {
                /* demo */
              }}
            />
            <UnauthorizedState
              action={
                <Button variant="outline" size="sm">
                  返回 Dashboard
                </Button>
              }
            />
            <ComingSoon
              title="Webhooks v2"
              description="新版 webhook 调度器正在开发中,预计下个月上线"
            />
            <EmptyList
              title="自定义空态"
              description="也可以传 icon / 不同文案"
              icon={<StarIcon className="size-4" />}
            />
          </div>
        </PageSection>

        {/* PageHeader variants */}
        <PageSection title="PageHeader 变体">
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-6">
              <PageHeader
                title="只有标题"
                description="最简形态,只 title + description"
              />
            </div>
            <div className="rounded-lg border bg-card p-6">
              <PageHeader
                icon={<ActivityIcon className="size-5" />}
                title="带图标和 badge"
                description="左上角徽章用 brand-soft 底,右上 badge 用 secondary"
                badge="Beta"
                actions={<Button size="sm">主操作</Button>}
              />
            </div>
            <div className="rounded-lg border bg-card p-6">
              <PageHeader
                title="只有 actions"
                actions={
                  <>
                    <Button variant="outline" size="sm">
                      Export
                    </Button>
                    <Button size="sm">
                      <PlusIcon />
                      新建
                    </Button>
                  </>
                }
              />
            </div>
          </div>
        </PageSection>
      </PageBody>
    </PageShell>
  )
}
