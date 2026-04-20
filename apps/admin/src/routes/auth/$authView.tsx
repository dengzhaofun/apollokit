import { AuthView } from "@daveyplate/better-auth-ui"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/auth/$authView")({
  component: AuthViewPage,
})

function AuthViewPage() {
  const { authView } = Route.useParams()

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-14">
      <AuthView pathname={authView} />
    </main>
  )
}
