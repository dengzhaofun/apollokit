import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/entity/")({
  beforeLoad: () => {
    throw redirect({ to: "/entity/schemas" })
  },
})
