import { createFileRoute, redirect } from "@tanstack/react-router"

import { openCreateModal } from "#/lib/modal-search"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/match-squad/create")({
  beforeLoad: () => {
    throw redirect({
      to: "/match-squad",
      search: openCreateModal,
    })
  },
})
