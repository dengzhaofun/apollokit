import { createFileRoute, redirect } from "@tanstack/react-router"

import { openCreateModal } from "#/lib/modal-search"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/mail/create")({
  beforeLoad: () => {
    throw redirect({
      to: "/mail",
      search: openCreateModal,
    })
  },
})
