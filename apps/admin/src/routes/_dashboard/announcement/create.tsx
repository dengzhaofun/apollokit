import { createFileRoute, redirect } from "@tanstack/react-router"

import { openCreateModal } from "#/lib/modal-search"

export const Route = createFileRoute("/_dashboard/announcement/create")({
  beforeLoad: () => {
    throw redirect({
      to: "/announcement",
      search: openCreateModal,
    })
  },
})
