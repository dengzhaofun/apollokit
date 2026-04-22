import { AuthView } from "@daveyplate/better-auth-ui"
import { createFileRoute } from "@tanstack/react-router"

import { seo } from "#/lib/seo"

export const Route = createFileRoute("/auth/$authView")({
  // 登录/注册/重置密码链路全部 noindex,避免回调 URL 的 token 参数被索引。
  head: () => seo({ title: "Sign in", noindex: true }),
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
