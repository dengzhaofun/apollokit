import { createFileRoute } from "@tanstack/react-router"

import Pricing from "#/components/pricing/Pricing"

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
})

function PricingPage() {
  return <Pricing />
}
