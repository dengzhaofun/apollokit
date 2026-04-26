import { createFileRoute, redirect } from "@tanstack/react-router"

import { openCreateModal } from "#/lib/modal-search"

export const Route = createFileRoute(
  "/_dashboard/entity/schemas/$schemaId/blueprints/create",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/entity/schemas/$schemaId",
      params: { schemaId: params.schemaId },
      search: openCreateModal,
    })
  },
})
