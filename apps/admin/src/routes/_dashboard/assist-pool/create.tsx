import { createFileRoute, redirect } from "@tanstack/react-router"

import { openCreateModal } from "#/lib/modal-search"

export const Route = createFileRoute("/_dashboard/assist-pool/create")({
  beforeLoad: () => {
    throw redirect({
      to: "/assist-pool",
      search: openCreateModal,
    })
  },
})
