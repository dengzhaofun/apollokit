import { Outlet, createFileRoute } from "@tanstack/react-router"

import Footer from "../components/Footer"
import Header from "../components/Header"

export const Route = createFileRoute("/_marketing")({
  component: MarketingLayout,
})

function MarketingLayout() {
  return (
    <>
      <Header />
      <Outlet />
      <Footer />
    </>
  )
}
