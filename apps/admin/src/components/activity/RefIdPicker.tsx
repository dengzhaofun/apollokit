import { useQuery } from "@tanstack/react-query"

import { Input } from "#/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { api } from "#/lib/api-client"
import { qs } from "#/hooks/use-list-search"
import type { NodeType } from "#/lib/types/activity"
import * as m from "#/paraglide/messages.js"

/**
 * Resource picker for "attach existing" flow on the activity Nodes tab.
 *
 * For nodeTypes that have a server-side list endpoint and a stable
 * identity field (id + name + alias), render a dropdown sourced from
 * the corresponding module's catalog. Falls back to a free-form UUID
 * input for nodeTypes that don't have a clean list endpoint
 * (game_board / custom / and the per-resource ones whose ID lookups
 * are less common in attach flows).
 *
 * Lists default to non-activity-bound resources (`activityId="null"`)
 * matching the stage F design — activity-scoped resources should be
 * created inline via NodeCreatorDialog instead of attached.
 */

interface ListItem {
  id: string
  name: string
  alias?: string | null
}

interface ListResponse {
  items: ListItem[]
}

const RESOURCE_ENDPOINT: Partial<Record<NodeType, string>> = {
  check_in: "/api/v1/check-in/configs",
  task_group: "/api/v1/task/definitions",
  lottery: "/api/v1/lottery/pools",
  leaderboard: "/api/v1/leaderboard/configs",
  banner: "/api/v1/banner/groups",
  exchange: "/api/v1/shop/products",
  assist_pool: "/api/v1/assist-pool/configs",
  entity_blueprint: "/api/v1/entity/blueprints",
  item_definition: "/api/v1/item/definitions",
  currency_definition: "/api/v1/currency/definitions",
}

interface Props {
  nodeType: NodeType
  value: string | null
  onChange: (value: string | null) => void
}

export function RefIdPicker({ nodeType, value, onChange }: Props) {
  const endpoint = RESOURCE_ENDPOINT[nodeType]
  const { data, isPending } = useQuery({
    queryKey: ["activity-nodes-attach-options", nodeType],
    queryFn: () =>
      api.get<ListResponse>(
        `${endpoint}?${qs({ limit: 200, activityId: "null" })}`,
      ),
    enabled: !!endpoint,
    select: (d) => d.items,
  })

  // Free-form fallback for nodeTypes without a list endpoint
  // (game_board / custom): they're virtual-by-design, so refId is
  // typically null. We still render an input in case the operator
  // really wants to attach something exotic.
  if (!endpoint) {
    return (
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={m.activity_nodes_field_ref_id_manual_placeholder()}
      />
    )
  }

  return (
    <Select value={value ?? ""} onValueChange={(v) => onChange(v || null)}>
      <SelectTrigger>
        <SelectValue
          placeholder={
            isPending
              ? m.activity_nodes_field_ref_id_loading()
              : m.activity_nodes_field_ref_id_pick()
          }
        />
      </SelectTrigger>
      <SelectContent>
        {(data ?? []).length === 0 ? (
          <SelectItem value="__empty" disabled>
            {m.activity_nodes_field_ref_id_empty()}
          </SelectItem>
        ) : (
          (data ?? []).map((it) => (
            <SelectItem key={it.id} value={it.id}>
              {it.name}
              {it.alias ? (
                <span className="ml-2 text-xs text-muted-foreground">
                  · {it.alias}
                </span>
              ) : null}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  )
}
