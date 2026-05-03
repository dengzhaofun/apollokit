import { createFileRoute, redirect } from "@tanstack/react-router"

import { openEditModal } from "#/lib/modal-search"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/banner/$groupId/edit")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/banner",
      search: openEditModal(params.groupId),
    })
  },
})
