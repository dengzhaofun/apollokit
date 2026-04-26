import { createFileRoute, redirect } from "@tanstack/react-router"

import { openCreateModal } from "#/lib/modal-search"

export const Route = createFileRoute("/_dashboard/check-in/create")({
  beforeLoad: () => {
    throw redirect({
      to: "/check-in",
      search: openCreateModal,
    })
  },
})
