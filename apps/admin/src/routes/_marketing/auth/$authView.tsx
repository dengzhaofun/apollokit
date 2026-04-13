import { AuthView } from "@daveyplate/better-auth-ui"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_marketing/auth/$authView")({
  component: AuthViewPage,
})

function AuthViewPage() {
  const { authView } = Route.useParams()

  return (
    <main className="page-wrap flex min-h-[60vh] flex-col items-center justify-center px-4 py-14">
      <AuthView pathname={authView} />
    </main>
  )
}
