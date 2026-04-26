import { createFileRoute, redirect } from "@tanstack/react-router"

import { openCreateModal } from "#/lib/modal-search"

export const Route = createFileRoute("/_dashboard/team/create")({
  beforeLoad: () => {
    throw redirect({
      to: "/team",
      search: openCreateModal,
    })
  },
})
