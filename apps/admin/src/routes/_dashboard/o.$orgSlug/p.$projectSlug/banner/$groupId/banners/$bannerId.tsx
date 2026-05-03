import { createFileRoute, redirect } from "@tanstack/react-router"

import { openEditChildModal } from "#/lib/modal-search"

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/banner/$groupId/banners/$bannerId",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/banner/$groupId",
      params: { groupId: params.groupId },
      search: openEditChildModal("banner", params.bannerId),
    })
  },
})
