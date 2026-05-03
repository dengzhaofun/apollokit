import { createFileRoute, redirect } from "@tanstack/react-router"

import { openCreateModal } from "#/lib/modal-search"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/match-squad/create")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/o/$orgSlug/p/$projectSlug/match-squad",
      search: openCreateModal,

      params,
    })
  },
})
