/**
 * `/admin` lands here — redirect to the MAU dashboard. The platform
 * surface only has one page in v1, so this is just a sane default;
 * extend the redirect logic if a future admin page should be the
 * preferred landing target.
 */

import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/mau" })
  },
})
