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

export function RouteBreadcrumb() {
  const { pathname } = useLocation()
  const groups = getNavGroups()

  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0) return null

  const moduleTo = `/${segments[0]}`
  const group = groups.find((g) => g.items.some((i) => i.to === moduleTo))
  const item = group?.items.find((i) => i.to === moduleTo)
  const tail = segments.slice(1).map((s) => decodeURIComponent(s))

  const onlyDashboard = moduleTo === "/dashboard" && tail.length === 0

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {onlyDashboard ? (
            <BreadcrumbPage>{m.nav_home()}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link to="/dashboard">{m.nav_home()}</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>

        {group && moduleTo !== "/dashboard" && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{group.label()}</BreadcrumbPage>
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
                <BreadcrumbLink asChild>
                  <Link to={item.to}>{item.title()}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </>
        )}

        {tail.map((seg, idx) => {
          const isLast = idx === tail.length - 1
          return (
            <Fragment key={`tail-${idx}-${seg}`}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{seg}</BreadcrumbPage>
                ) : (
                  <span className="text-muted-foreground">{seg}</span>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
