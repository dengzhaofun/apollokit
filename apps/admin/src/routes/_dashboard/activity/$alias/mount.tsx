import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { useCreateActivityNode } from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"
import type { NodeType } from "#/lib/types/activity"

type MountSearch = {
  nodeType: string
  alias: string
  orderIndex: number
  createdRefId?: string
}

/**
 * Landing page after the admin creates an underlying config via
 * `/task/create` or `/shop/create` with `?returnTo=…/mount?…`.
 *
 * The module's create page redirects here with
 *   ?nodeType=<task_group|exchange>
 *   &alias=<node alias>
 *   &orderIndex=<n>
 *   &createdRefId=<new config id>   (added by the module on success)
 *
 * We POST the activity node linking refId and redirect back to the
 * activity detail (nodes tab). No visible form — this is glue.
 */
export const Route = createFileRoute("/_dashboard/activity/$alias/mount")({
  component: ActivityMountPage,
  validateSearch: (raw: Record<string, unknown>): MountSearch => ({
    nodeType: typeof raw.nodeType === "string" ? raw.nodeType : "",
    alias: typeof raw.alias === "string" ? raw.alias : "",
    orderIndex: Number(raw.orderIndex) || 0,
    createdRefId:
      typeof raw.createdRefId === "string" ? raw.createdRefId : undefined,
  }),
})

function ActivityMountPage() {
  const { alias } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const createMutation = useCreateActivityNode(alias)
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current) return
    if (!search.createdRefId) return
    firedRef.current = true
    ;(async () => {
      try {
        await createMutation.mutateAsync({
          alias: search.alias,
          nodeType: search.nodeType as NodeType,
          refId: search.createdRefId!,
          orderIndex: search.orderIndex ?? 0,
        })
        toast.success(`节点 ${search.alias} 已挂载`)
      } catch (err) {
        if (err instanceof ApiError) toast.error(err.body.error)
        else toast.error("挂载失败")
      }
      navigate({ to: "/activity/$alias", params: { alias } })
    })()
  }, [search, alias, createMutation, navigate])

  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      {search.createdRefId ? (
        <span>正在挂载节点 {search.alias}…</span>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <span>缺少 createdRefId 参数。</span>
          <a
            className="text-primary underline"
            href={`/activity/${alias}`}
          >
            返回活动详情
          </a>
        </div>
      )}
    </div>
  )
}
