import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_dashboard/item/")({
  beforeLoad: () => {
    throw redirect({ to: "/item/definitions" })
  },
})
