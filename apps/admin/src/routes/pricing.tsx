import { createFileRoute } from "@tanstack/react-router"

import Pricing from "#/components/pricing/Pricing"
import { seo } from "#/lib/seo"

export const Route = createFileRoute("/pricing")({
  head: () =>
    seo({
      title: "定价",
      description:
        "ApolloKit 定价方案 —— 从免费自托管到企业版,按团队规模与运营能力灵活选择,所有能力统一 API、统一文档。",
      path: "/pricing",
    }),
  component: PricingPage,
})

function PricingPage() {
  return <Pricing />
}
