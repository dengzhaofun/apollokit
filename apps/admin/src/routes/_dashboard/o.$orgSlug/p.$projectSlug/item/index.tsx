import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/item/")({
  beforeLoad: () => {
    throw redirect({ to: "/item/definitions" })
  },
})
