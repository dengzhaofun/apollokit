import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { useAllActivities } from "#/hooks/use-activity"
import * as m from "#/paraglide/messages.js"

export type ActivityScope =
  | { kind: "standalone" }
  | { kind: "all" }
  | { kind: "activity"; activityId: string }

const STANDALONE = "__standalone__"
const ALL = "__all__"

/**
 * Shared filter bar for module list pages (check-in / task / shop /
 * banner / lottery). Lets the admin toggle between:
 *
 *   - 仅常驻 (default, activity_id IS NULL)
 *   - 全部 (includeActivity=true)
 *   - 某活动 (activity_id = <selected>)
 *
 * The caller translates the chosen scope into hook filter params.
 */
export function ActivityScopeFilter({
  value,
  onChange,
  label,
}: {
  value: ActivityScope
  onChange: (scope: ActivityScope) => void
  label?: string
}) {
  const { data: activities } = useAllActivities()
  const selectValue =
    value.kind === "standalone"
      ? STANDALONE
      : value.kind === "all"
        ? ALL
        : value.activityId

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label ?? m.activity_scope_label()}</span>
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === STANDALONE) onChange({ kind: "standalone" })
          else if (v === ALL) onChange({ kind: "all" })
          else onChange({ kind: "activity", activityId: v ?? "" })
        }}
      >
        <SelectTrigger className="h-8 w-auto min-w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={STANDALONE}>{m.activity_scope_standalone()}</SelectItem>
          <SelectItem value={ALL}>{m.activity_scope_all()}</SelectItem>
          {(activities ?? []).map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {m.activity_scope_prefix({ name: a.name })}
              <code className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                {a.alias}
              </code>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * Translate an ActivityScope into hook filter params. Helpers keep the
 * list pages terse.
 */
export function scopeToFilter(
  scope: ActivityScope,
): { activityId?: string; includeActivity?: boolean } {
  if (scope.kind === "activity") return { activityId: scope.activityId }
  if (scope.kind === "all") return { includeActivity: true }
  return {}
}
