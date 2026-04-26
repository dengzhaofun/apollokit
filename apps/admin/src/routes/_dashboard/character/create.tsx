import { createFileRoute, redirect } from "@tanstack/react-router"

import { openCreateModal } from "#/lib/modal-search"

export const Route = createFileRoute("/_dashboard/character/create")({
  beforeLoad: () => {
    throw redirect({
      to: "/character",
      search: openCreateModal,
    })
  },
})
