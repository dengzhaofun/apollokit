import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

/**
 * 嵌套 URL → 现有扁平路由的兜底桥接。
 *
 * 业务模块还没物理迁移到 `/o/:org/p/:project/<module>` 下时,
 * 用户(或同事的分享链接)直接访问该嵌套 URL 会落到这里。
 * 父级 `p.$projectSlug.tsx` 已经把 session.activeTeamId 拨到 URL
 * 指向的项目,我们再 navigate 到 `/<module>...` 即可让现有扁平
 * 路由继续渲染,且数据已经在新项目作用域。
 *
 * 等业务模块完成物理迁移后,本兜底文件可以删掉(或保留作为
 * 老书签的安全网)。
 */
export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/$")({
  component: ProjectScopedRedirect,
})

function ProjectScopedRedirect() {
  const { _splat } = Route.useParams()
  const navigate = useNavigate()
  const [redirected, setRedirected] = useState(false)

  useEffect(() => {
    if (redirected) return
    setRedirected(true)
    // _splat 是 "" 时是项目根 (index 已处理),只需对非空切换。
    if (!_splat) return
    const target = _splat.startsWith("/") ? _splat : `/${_splat}`
    navigate({ to: target as never, replace: true })
  }, [_splat, navigate, redirected])

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="text-sm text-muted-foreground">正在切换到 {_splat}…</p>
    </div>
  )
}
