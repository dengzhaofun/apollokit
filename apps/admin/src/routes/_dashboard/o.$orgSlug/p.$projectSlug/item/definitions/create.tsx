import { createFileRoute, redirect } from "@tanstack/react-router"

import { openCreateModal } from "#/lib/modal-search"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/item/definitions/create")({
  beforeLoad: () => {
    throw redirect({
      to: "/item/definitions",
      search: openCreateModal,
    })
  },
})
