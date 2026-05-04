import { useQueryClient } from "@tanstack/react-query"
import { useRouter, useLocation } from "@tanstack/react-router"
import {
  BuildingIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  MailPlusIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover"
import { SidebarMenuButton } from "#/components/ui/sidebar"
import { authClient } from "#/lib/auth-client"
import {
  invalidateTenantCache,
  listOrgsForUser,
  listTeamsForOrg,
  projectUrl,
  type ResolvedOrg,
  type ResolvedTeam,
} from "#/lib/tenant"
import * as m from "#/paraglide/messages.js"
import { cn } from "#/lib/utils"

/**
 * 合并版组织+项目切换器 —— 替代过去并排两颗 switcher 的拥挤布局。
 *
 * 设计参考 Linear:org+team 是绑定关系(切 org 必然 team 列表跟着变),
 * 用户心智更接近"workspace 切换",所以单 popover 把两层信息收口。
 *
 * 关键改动 vs 老 ProjectSwitcher:
 *   - 切项目不再 window.location.reload(),走 router.navigate +
 *     queryClient.invalidate;切完 toast 反馈
 *   - URL 是 SoT —— 切完 navigate 到 `/o/:orgSlug/p/:newSlug`,
 *     如果当前在 settings/* 这种全局页则不动 URL,只 invalidate
 *   - 一颗触发器同时显示 Org + Project 名,点开后 popover 内分两段
 *   - 自带 fuzzy search,无需 cmdk(本组件信息密度还不至于)
 *
 * Settings 入口 / 创建组织/项目入口都从 popover 底部进。
 */

interface Props {
  /** sidebar 折叠到 icon 模式时切到 32px 紧凑形态。 */
  isIcon?: boolean
}

export function OrgProjectSwitcher({ isIcon = false }: Props) {
  const { data: session } = authClient.useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { pathname } = useLocation()

  const [orgs, setOrgs] = useState<ResolvedOrg[] | null>(null)
  const [teams, setTeams] = useState<ResolvedTeam[] | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [switching, setSwitching] = useState(false)

  const activeOrgId = session?.session.activeOrganizationId ?? null
  const activeTeamId = session?.session.activeTeamId ?? null

  // 拉 orgs(全部用户能看到的),并按 active org 拉 teams。
  useEffect(() => {
    let cancelled = false
    listOrgsForUser().then((rows) => {
      if (!cancelled) setOrgs(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!activeOrgId) {
      setTeams(null)
      return
    }
    let cancelled = false
    listTeamsForOrg(activeOrgId).then((rows) => {
      if (!cancelled) setTeams(rows)
    })
    return () => {
      cancelled = true
    }
  }, [activeOrgId])

  const activeOrg = useMemo(
    () => orgs?.find((o) => o.id === activeOrgId) ?? null,
    [orgs, activeOrgId],
  )
  const activeTeam = useMemo(
    () => teams?.find((t) => t.id === activeTeamId) ?? null,
    [teams, activeTeamId],
  )

  const filteredTeams = useMemo(() => {
    if (!teams) return []
    const q = query.trim().toLowerCase()
    if (!q) return teams
    return teams.filter((t) => t.name.toLowerCase().includes(q))
  }, [teams, query])

  const filteredOrgs = useMemo(() => {
    if (!orgs) return []
    const q = query.trim().toLowerCase()
    if (!q) return orgs
    return orgs.filter(
      (o) =>
        o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q),
    )
  }, [orgs, query])

  const switchProject = async (team: ResolvedTeam) => {
    if (team.id === activeTeamId) {
      setOpen(false)
      return
    }
    if (!activeOrg) {
      toast.error(m.org_switcher_error_not_ready())
      return
    }
    setSwitching(true)
    try {
      await (
        authClient.organization as unknown as {
          setActiveTeam: (args: { teamId: string }) => Promise<unknown>
        }
      ).setActiveTeam({ teamId: team.id })
      // 决定目标 URL —— 三档智能策略:
      //   1) 当前在项目作用域(/o/:org/p/:slug/...): 把 :slug 换成新 team.id
      //   2) 当前在全局页(settings/*): URL 不动,只 invalidate
      //   3) 兜底: 跳到新项目概览页
      const projMatch = pathname.match(/^\/o\/([^/]+)\/p\/([^/]+)(\/.*)?$/)
      let target: string | null = null
      if (projMatch) {
        const restPath = projMatch[3] ?? ""
        target = `/o/${activeOrg.slug}/p/${team.id}${restPath}`
      } else if (
        pathname.startsWith("/settings") ||
        pathname.startsWith("/onboarding")
      ) {
        // 全局页:URL 不动,只让 query 重抓
        target = null
      } else {
        target = projectUrl(activeOrg.slug, team.id)
      }
      // 清掉所有 tenant-scoped query 缓存。简单粗暴 invalidate 全部,
      // 后续若 query key 全部按 [projectId, ...] 标准化,可改为按前缀清。
      await queryClient.invalidateQueries()
      if (target) {
        await router.navigate({ to: target })
      } else {
        await router.invalidate()
      }
      toast.success(m.org_switcher_switched_to({ name: team.name }))
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.org_switcher_switch_failed())
    } finally {
      setSwitching(false)
    }
  }

  const switchOrganization = async (org: ResolvedOrg) => {
    if (org.id === activeOrgId) {
      setOpen(false)
      return
    }
    setSwitching(true)
    try {
      await authClient.organization.setActive({ organizationId: org.id })
      // server hook 会自动选第一个 team,我们查一下用作目标 URL
      invalidateTenantCache()
      const orgTeams = await listTeamsForOrg(org.id)
      const firstTeam = orgTeams[0]
      await queryClient.invalidateQueries()
      if (firstTeam) {
        await router.navigate({
          to: projectUrl(org.slug, firstTeam.id),
        })
      } else {
        // 空 org,去 onboarding 创建项目
        await router.navigate({ to: "/onboarding/create-project" })
      }
      toast.success(m.org_switcher_switched_to({ name: org.name }))
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.org_switcher_switch_failed())
    } finally {
      setSwitching(false)
    }
  }

  const goCreateProject = async () => {
    setOpen(false)
    await router.navigate({ to: "/onboarding/create-project" })
  }

  if (!activeOrgId) return null

  const orgInitial = (activeOrg?.name ?? "?").slice(0, 1).toUpperCase()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <SidebarMenuButton
            size={isIcon ? "default" : "lg"}
            tooltip={
              activeOrg && activeTeam
                ? `${activeOrg.name} · ${activeTeam.name}`
                : m.org_switcher_tooltip()
            }
            aria-label={m.org_switcher_aria_label()}
            className={cn(
              "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
            )}
          >
            <Avatar size="sm" className="size-6 rounded-md">
              {activeOrg?.logo ? (
                <AvatarImage src={activeOrg.logo} alt={activeOrg.name} />
              ) : null}
              <AvatarFallback className="rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                {orgInitial}
              </AvatarFallback>
            </Avatar>
            {!isIcon && (
              <div className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-xs font-medium text-muted-foreground">
                  {activeOrg?.name ?? m.org_switcher_org_fallback()}
                </span>
                <span className="truncate text-sm font-semibold">
                  {activeTeam?.name ?? m.org_switcher_project_fallback()}
                </span>
              </div>
            )}
            {!isIcon && (
              <ChevronsUpDownIcon className="ml-auto size-4 shrink-0 opacity-60" />
            )}
          </SidebarMenuButton>
        }
      />
      <PopoverContent
        align="start"
        side="right"
        sideOffset={8}
        className="w-[320px] p-0"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <div className="flex flex-1 items-center gap-2">
            <Avatar size="sm" className="size-6 rounded-md">
              {activeOrg?.logo ? (
                <AvatarImage src={activeOrg.logo} alt={activeOrg.name} />
              ) : null}
              <AvatarFallback className="rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                {orgInitial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {activeOrg?.name ?? "—"}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {activeOrg?.slug ?? ""}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              setOpen(false)
              await router.navigate({ to: "/settings/organization" })
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title={m.org_switcher_org_settings_title()}
          >
            <Settings2Icon className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b px-3 py-2">
          <SearchIcon className="size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m.org_switcher_search_placeholder()}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            autoFocus
          />
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {/* PROJECTS in current org */}
          <div className="px-1.5 py-1.5">
            <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {activeOrg?.name ?? "PROJECTS"} · {m.org_switcher_projects_label()}
            </div>
            {!teams ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {m.org_switcher_loading()}
              </div>
            ) : filteredTeams.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {query ? m.org_switcher_no_match_projects() : m.org_switcher_no_projects()}
              </div>
            ) : (
              filteredTeams.map((t, idx) => {
                const isActive = t.id === activeTeamId
                const shortcut = idx < 9 ? `⌘${idx + 1}` : ""
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={switching}
                    onClick={() => switchProject(t)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors",
                      "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                      isActive && "bg-accent/60 font-medium",
                    )}
                  >
                    <span className="flex size-5 items-center justify-center rounded bg-muted text-[10px] font-semibold">
                      {(t.name ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate text-left">{t.name}</span>
                    {isActive ? (
                      <CheckIcon className="size-3.5 text-primary" />
                    ) : shortcut ? (
                      <kbd className="ml-auto rounded border bg-muted px-1 py-0 text-[10px] font-mono">
                        {shortcut}
                      </kbd>
                    ) : null}
                  </button>
                )
              })
            )}
            <button
              type="button"
              onClick={goCreateProject}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground"
            >
              <PlusIcon className="size-3.5" />
              {m.org_switcher_create_project()}
            </button>
          </div>

          {/* ALL ORGANIZATIONS — only render if user has 2+ */}
          {orgs && orgs.length > 1 ? (
            <div className="border-t px-1.5 py-1.5">
              <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {m.org_switcher_all_orgs()}
              </div>
              {filteredOrgs.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {m.org_switcher_no_match_orgs()}
                </div>
              ) : (
                filteredOrgs.map((o) => {
                  const isActive = o.id === activeOrgId
                  return (
                    <button
                      key={o.id}
                      type="button"
                      disabled={switching}
                      onClick={() => switchOrganization(o)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors",
                        "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                        isActive && "bg-accent/60 font-medium",
                      )}
                    >
                      <Avatar size="sm" className="size-5 rounded">
                        {o.logo ? (
                          <AvatarImage src={o.logo} alt={o.name} />
                        ) : null}
                        <AvatarFallback className="rounded bg-primary/10 text-[10px] font-semibold text-primary">
                          {(o.name ?? "?").slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 truncate text-left">{o.name}</span>
                      {isActive ? (
                        <CheckIcon className="size-3.5 text-primary" />
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>
          ) : null}

          {/* Footer: 创建组织(占位 link 到 settings) + 邀请提示 */}
          <div className="border-t p-1.5">
            <button
              type="button"
              onClick={async () => {
                setOpen(false)
                await router.navigate({ to: "/settings/organization" })
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground"
            >
              <BuildingIcon className="size-3.5" />
              {m.org_switcher_manage_org()}
            </button>
            <button
              type="button"
              onClick={async () => {
                setOpen(false)
                await router.navigate({ to: "/settings/organization" })
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground"
            >
              <MailPlusIcon className="size-3.5" />
              {m.org_switcher_invite_member()}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export type { ResolvedOrg, ResolvedTeam }
