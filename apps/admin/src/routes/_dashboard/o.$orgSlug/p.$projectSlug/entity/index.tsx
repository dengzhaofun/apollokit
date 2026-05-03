import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/entity/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/o/$orgSlug/p/$projectSlug/entity/schemas", params })
  },
})
