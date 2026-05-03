import { createFileRoute, redirect } from "@tanstack/react-router"

import { openCreateModal } from "#/lib/modal-search"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/lottery/create")({
  beforeLoad: () => {
    throw redirect({
      to: "/lottery",
      search: openCreateModal,
    })
  },
})
