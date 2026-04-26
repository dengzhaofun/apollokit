import { createFileRoute, redirect } from "@tanstack/react-router"

/*
 * /cookies 是常见外链与 SEO 收录路径,但我们的 cookie 政策内容并入 /privacy
 * 的 #cookies 锚点,以避免内容重复。这里直接 302 跳转。
 */
export const Route = createFileRoute("/cookies")({
  beforeLoad: () => {
    throw redirect({ to: "/privacy", hash: "cookies" })
  },
})
