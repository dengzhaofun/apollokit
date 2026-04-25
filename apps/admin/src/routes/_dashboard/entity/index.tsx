import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_dashboard/entity/")({
  beforeLoad: () => {
    throw redirect({ to: "/entity/schemas" })
  },
})
