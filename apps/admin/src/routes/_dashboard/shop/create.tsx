import { createFileRoute, redirect } from "@tanstack/react-router"

import { openCreateModal } from "#/lib/modal-search"

export const Route = createFileRoute("/_dashboard/shop/create")({
  beforeLoad: () => {
    throw redirect({
      to: "/shop",
      search: openCreateModal,
    })
  },
})
