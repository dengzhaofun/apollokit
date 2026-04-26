import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { useAllActivities } from "#/hooks/use-activity"
import * as m from "#/paraglide/messages.js"

const UNBOUND = "__none__"

interface Props {
  value: string | null | undefined
  onChange: (value: string | null) => void
  disabled?: boolean
  placeholder?: string
  /** Show only non-archived activities by default so picker stays short. */
  hideArchived?: boolean
}

/**
 * Dropdown that lets the admin bind a standalone config to an activity
 * (or clear the binding). Loaded lazily via `useAllActivities()`; while the
 * list is loading the picker shows a disabled placeholder, so forms can
 * render immediately without a skeleton.
 *
 * Used by check-in / task / shop / banner / lottery ConfigForms as a
 * shared building block.
 */
export function ActivityPicker({
  value,
  onChange,
  disabled,
  placeholder,
  hideArchived = true,
}: Props) {
  const { data: activities, isPending } = useAllActivities()
  const items = (activities ?? []).filter((a) =>
    hideArchived ? a.status !== "archived" : true,
  )
  const selected = value ?? UNBOUND
  const placeholderText = placeholder ?? m.activity_picker_unbound()

  return (
    <Select
      value={selected}
      onValueChange={(v) => onChange(v === UNBOUND ? null : v)}
      disabled={disabled || isPending}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholderText} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNBOUND}>{placeholderText}</SelectItem>
        {items.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
            <code className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
              {a.alias}
            </code>
            <span className="ml-2 text-xs text-muted-foreground">
              {a.status}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
