import { Link, useLocation } from "@tanstack/react-router"
import { Fragment } from "react"

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

export function RouteBreadcrumb() {
  const { pathname } = useLocation()
  const groups = getNavGroups()

  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0) return null

  const moduleTo = `/${segments[0]}`
  const group = groups.find((g) => g.items.some((i) => i.to === moduleTo))
  const item = group?.items.find((i) => i.to === moduleTo)
  const tail = segments.slice(1).map((s) => decodeURIComponent(s))
  // 三级菜单:tail[0] 命中父项的某个 child 时,显示 child.title() 而非 raw segment
  const childTo = tail.length > 0 ? `${moduleTo}/${tail[0]}` : null
  const child = item?.children?.find((c) => c.to === childTo)

  const onlyDashboard = moduleTo === "/dashboard" && tail.length === 0

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {onlyDashboard ? (
            <BreadcrumbPage>{m.nav_home()}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink render={<Link to="/dashboard">{m.nav_home()}</Link>} />
          )}
        </BreadcrumbItem>

        {group && moduleTo !== "/dashboard" && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-muted-foreground font-normal">
                {group.label()}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}

        {item && moduleTo !== "/dashboard" && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {tail.length === 0 ? (
                <BreadcrumbPage>{item.title()}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink render={<Link to={item.to}>{item.title()}</Link>} />
              )}
            </BreadcrumbItem>
          </>
        )}

        {tail.map((seg, idx) => {
          const isLast = idx === tail.length - 1
          const label = idx === 0 && child ? child.title() : formatSegment(seg)
          return (
            <Fragment key={`tail-${idx}-${seg}`}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : idx === 0 && child ? (
                  <BreadcrumbLink render={<Link to={child.to}>{label}</Link>} />
                ) : (
                  <span className="text-muted-foreground">{label}</span>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
