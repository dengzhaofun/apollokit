import { useState } from "react"
import { ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { Button } from "#/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import {
  UnlockRuleEditor,
  type UnlockRule,
} from "#/components/activity/UnlockRuleEditor"
import { useUpdateActivityNode } from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"
import type { ActivityNode } from "#/lib/types/activity"
import * as m from "#/paraglide/messages.js"

/**
 * Inline node edit modal — opened from the Configured Nodes row's "edit"
 * button. Surfaces only the node-level fields (alias / refId / nodeType
 * are immutable; resource-level edits jump out to the resource module).
 *
 *   - orderIndex     plain number
 *   - unlockRule     freeform JSON (gate combinations are expressive
 *                    enough that a visual editor would either be a toy
 *                    or an entire screen — JSON is fine for now)
 *   - nodeConfig     freeform JSON (only meaningful for virtual nodes
 *                    like game_board / custom that store inline config)
 *
 * Submit: useUpdateActivityNode → PATCH /api/v1/activity/nodes/:id.
 */

const RESOURCE_DETAIL_PATH: Partial<Record<string, (refId: string) => string>> =
  {
    check_in: (id) => `/check-in/${id}`,
    task_group: (id) => `/task/${id}`,
    lottery: (id) => `/lottery/${id}`,
    leaderboard: (id) => `/leaderboard/${id}`,
    banner: (id) => `/banner/${id}`,
    exchange: (id) => `/shop/${id}`,
    assist_pool: (id) => `/assist-pool/${id}`,
    entity_blueprint: (id) => `/entity/blueprint/${id}`,
    item_definition: (id) => `/item/${id}`,
    currency_definition: (id) => `/currency/${id}`,
  }

interface Props {
  activityKey: string
  node: ActivityNode | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NodeEditDialog({ activityKey, node, open, onOpenChange }: Props) {
  const update = useUpdateActivityNode(activityKey)
  const [orderIndex, setOrderIndex] = useState<number>(node?.orderIndex ?? 0)
  const [unlockRule, setUnlockRule] = useState<UnlockRule | null>(
    () => (node?.unlockRule as UnlockRule | null) ?? null,
  )
  const [nodeConfigJson, setNodeConfigJson] = useState<string>(() =>
    node?.nodeConfig ? JSON.stringify(node.nodeConfig, null, 2) : "",
  )

  if (!node) return null

  const detailPath = RESOURCE_DETAIL_PATH[node.nodeType]

  async function handleSubmit() {
    if (!node) return
    let nodeConfig: Record<string, unknown> | null = null
    try {
      nodeConfig = nodeConfigJson.trim()
        ? (JSON.parse(nodeConfigJson) as Record<string, unknown>)
        : null
    } catch {
      toast.error(m.activity_node_edit_node_config_invalid())
      return
    }
    try {
      await update.mutateAsync({
        id: node.id,
        orderIndex,
        unlockRule: unlockRule as Record<string, unknown> | null,
        nodeConfig,
      })
      toast.success(m.activity_node_edit_save_success())
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.activity_node_edit_save_failed())
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>{m.activity_node_edit_title()}</DialogTitle>
          <DialogDescription>
            {m.activity_node_edit_description()}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {/* Identity (read-only) */}
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-2">
              <code className="rounded bg-background px-1.5 py-0.5 text-xs">
                {node.alias}
              </code>
              <span className="text-xs text-muted-foreground">
                · {node.nodeType}
              </span>
              {node.refId && detailPath ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7"
                  onClick={() => window.open(detailPath(node.refId!), "_blank")}
                >
                  {m.activity_node_edit_open_resource()}
                  <ExternalLink className="size-3" />
                </Button>
              ) : null}
            </div>
            {node.refId ? (
              <p className="mt-1 text-xs text-muted-foreground">
                refId: <code>{node.refId}</code>
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {m.activity_node_edit_virtual_node()}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="node-order">
              {m.activity_node_edit_order_label()}
            </Label>
            <Input
              id="node-order"
              type="number"
              value={orderIndex}
              onChange={(e) => setOrderIndex(Number(e.target.value) || 0)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{m.activity_node_edit_unlock_rule_label()}</Label>
            <UnlockRuleEditor value={unlockRule} onChange={setUnlockRule} />
            <p className="text-xs text-muted-foreground">
              {m.activity_node_edit_unlock_rule_hint()}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="node-config">
              {m.activity_node_edit_node_config_label()}
            </Label>
            <Textarea
              id="node-config"
              rows={4}
              value={nodeConfigJson}
              onChange={(e) => setNodeConfigJson(e.target.value)}
              placeholder='{"foo": "bar"}'
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {m.activity_node_edit_node_config_hint()}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={update.isPending}
          >
            {m.common_cancel()}
          </Button>
          <Button onClick={handleSubmit} disabled={update.isPending}>
            {update.isPending
              ? m.common_saving()
              : m.activity_node_edit_save()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
