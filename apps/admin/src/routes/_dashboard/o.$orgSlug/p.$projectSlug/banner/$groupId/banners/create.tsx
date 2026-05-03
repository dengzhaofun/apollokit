import { createFileRoute, redirect } from "@tanstack/react-router"

import { openCreateChildModal } from "#/lib/modal-search"

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/banner/$groupId/banners/create",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/o/$orgSlug/p/$projectSlug/banner/$groupId",
      params: { ...params, groupId: params.groupId },
      search: openCreateChildModal("banner"),
    })
  },
})
