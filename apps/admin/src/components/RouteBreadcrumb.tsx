import { useLocation, Link } from "@tanstack/react-router"
import { Fragment, type ReactNode } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "#/components/ui/breadcrumb"
import { useTenantParams } from "#/hooks/use-tenant-params"
import { getNavGroups } from "./AppSidebar"
import * as m from "../paraglide/messages.js"

const formatSegment = (s: string) =>
  s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)

interface Crumb {
  label: ReactNode
  /** TSR path template (e.g. "/o/$orgSlug/p/$projectSlug/shop"); absent for
   *  non-link crumbs (group labels, current page). */
  to?: string
  isPage?: boolean
}

/**
 * Build crumbs from a nested-project URL (/o/{orgSlug}/p/{projectSlug}/{module}/...).
 * Uses TSR path templates (with $-tokens) for nav-item lookups and link targets.
 * Returns [] for non-project URLs (settings, auth, etc.) — caller returns null.
 */
function buildCrumbs(pathname: string): Crumb[] {
  const groups = getNavGroups()
  const segments = pathname.split("/").filter(Boolean)

  // Expect /o/{orgSlug}/p/{projectSlug}/{module?}/{...tail}
  if (segments[0] !== "o" || segments[2] !== "p" || segments.length < 4) return []

  const moduleSegment = segments[4]
  if (!moduleSegment) return []

  const moduleTo = `/o/$orgSlug/p/$projectSlug/${moduleSegment}`
  const dashboardPath = "/o/$orgSlug/p/$projectSlug/dashboard"

  const group = groups.find((g) => g.items.some((i) => i.to === moduleTo))
  const item = group?.items.find((i) => i.to === moduleTo)
  const tail = segments.slice(5).map((s) => decodeURIComponent(s))
  const childTo = tail.length > 0 ? `${moduleTo}/${tail[0]}` : null
  const child = item?.children?.find((c) => c.to === childTo)
  const onlyDashboard = moduleTo === dashboardPath && tail.length === 0

  const crumbs: Crumb[] = []

  crumbs.push({
    label: m.nav_home(),
    to: onlyDashboard ? undefined : dashboardPath,
    isPage: onlyDashboard,
  })

  if (group && !onlyDashboard) {
    crumbs.push({ label: group.label() })
  }

  if (item && !onlyDashboard) {
    crumbs.push({
      label: item.title(),
      to: tail.length === 0 ? undefined : item.to,
      isPage: tail.length === 0,
    })
  }

  tail.forEach((seg, idx) => {
    const isLast = idx === tail.length - 1
    const label = idx === 0 && child ? child.title() : formatSegment(seg)
    crumbs.push({
      label,
      to: isLast ? undefined : idx === 0 && child ? child.to : undefined,
      isPage: isLast,
    })
  })

  return crumbs
}

export function RouteBreadcrumb() {
  const { pathname } = useLocation()
  const { orgSlug, projectSlug } = useTenantParams()
  const crumbs = buildCrumbs(pathname)
  if (crumbs.length === 0) return null

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1
          const hiddenOnMobile = isLast ? undefined : "max-md:hidden"
          return (
            <Fragment key={`${idx}-${typeof crumb.label === "string" ? crumb.label : ""}`}>
              {idx > 0 ? <BreadcrumbSeparator className="max-md:hidden" /> : null}
              <BreadcrumbItem className={hiddenOnMobile}>
                {crumb.isPage ? (
                  <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                ) : crumb.to ? (
                  <BreadcrumbLink
                    className="truncate"
                    render={
                      <Link to={crumb.to} params={{ orgSlug, projectSlug }}>
                        {crumb.label}
                      </Link>
                    }
                  />
                ) : (
                  <span className="truncate text-muted-foreground font-normal">
                    {crumb.label}
                  </span>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
