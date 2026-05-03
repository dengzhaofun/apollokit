import { useLocation } from "@tanstack/react-router"
import { Link } from "#/components/router-helpers"
import { Fragment, type ReactNode } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "#/components/ui/breadcrumb"
import { getNavGroups } from "./AppSidebar"
import * as m from "../paraglide/messages.js"

const formatSegment = (s: string) =>
  s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)

interface Crumb {
  /** Display label. */
  label: ReactNode
  /** Link target if this crumb should be a clickable link; absent for the
   *  current page or for non-link ancestors (e.g. group label). */
  to?: string
  /** When true, render as `BreadcrumbPage` (the current page); otherwise as
   *  link or muted ancestor text. */
  isPage?: boolean
}

/**
 * Build the linear list of crumbs from the URL. Layout decides what to
 * render where — the mobile branch shows only the leaf, desktop shows
 * the full chain. This avoids the breadcrumb wrapping to multiple lines
 * inside the 56px-tall header on narrow viewports.
 */
function buildCrumbs(pathname: string): Crumb[] {
  const groups = getNavGroups()
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0) return []

  const moduleTo = `/${segments[0]}`
  const group = groups.find((g) => g.items.some((i) => i.to === moduleTo))
  const item = group?.items.find((i) => i.to === moduleTo)
  const tail = segments.slice(1).map((s) => decodeURIComponent(s))
  const childTo = tail.length > 0 ? `${moduleTo}/${tail[0]}` : null
  const child = item?.children?.find((c) => c.to === childTo)
  const onlyDashboard = moduleTo === "/dashboard" && tail.length === 0

  const crumbs: Crumb[] = []

  // Home (always first)
  crumbs.push({
    label: m.nav_home(),
    to: onlyDashboard ? undefined : "/dashboard",
    isPage: onlyDashboard,
  })

  // Group label (sidebar section, e.g. "Social & Competition") — never a link.
  if (group && moduleTo !== "/dashboard") {
    crumbs.push({ label: group.label() })
  }

  // Module item (e.g. "Team") — link if there are tail segments below it,
  // page if this IS the current view.
  if (item && moduleTo !== "/dashboard") {
    crumbs.push({
      label: item.title(),
      to: tail.length === 0 ? undefined : item.to,
      isPage: tail.length === 0,
    })
  }

  // Tail segments — last is the current page; first may resolve to a child
  // nav entry (so we use its title instead of raw URL segment).
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
  const crumbs = buildCrumbs(pathname)
  if (crumbs.length === 0) return null

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1
          // Mobile: show only the leaf — every ancestor crumb AND every
          // separator is hidden so the breadcrumb fits on one line inside
          // the 56px header. The leaf has no leading separator (idx > 0
          // is false for idx 0, and for the leaf the preceding separator
          // belongs to an ancestor row that's hidden). Desktop: full chain.
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
                    render={<Link to={crumb.to}>{crumb.label}</Link>}
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
