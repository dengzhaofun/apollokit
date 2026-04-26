import { createFileRoute, redirect } from "@tanstack/react-router"

import { openCreateModal } from "#/lib/modal-search"

export const Route = createFileRoute("/_dashboard/item/categories/create")({
  beforeLoad: () => {
    throw redirect({
      to: "/item/categories",
      search: openCreateModal,
    })
  },
})
