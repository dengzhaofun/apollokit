import { useTenantParams } from "#/hooks/use-tenant-params";
import { Link } from "@tanstack/react-router";
import { useAnalyticsEventOptions } from "#/hooks/use-analytics-event-options"
import { Input } from "#/components/ui/input"
import * as m from "#/paraglide/messages.js"

interface EventNamePickerProps {
  listId: string
  value: string
  onChange: (next: string) => void
  from: Date | string
  to: Date | string
  placeholder?: string
  /** 是否在控件下方展示"浏览事件目录"链接（默认 true） */
  showCatalogLink?: boolean
  className?: string
}

export function EventNamePicker({
  listId,
  value,
  onChange,
  from,
  to,
  placeholder,
  showCatalogLink = true,
  className,
}: EventNamePickerProps) {
  const { options } = useAnalyticsEventOptions({ from, to })
  const { orgSlug, projectSlug } = useTenantParams()

  return (
    <div className="flex flex-col gap-1">
      <Input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? m.analytics_explore_event_placeholder()}
        className={
          className ?? "h-8 font-mono text-xs"
        }
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt.event} value={opt.event}>
            {formatLabel(opt)}
          </option>
        ))}
      </datalist>
      {showCatalogLink ? (
        <Link
          to="/o/$orgSlug/p/$projectSlug/event-catalog" params={{ orgSlug, projectSlug }}
          className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
        >
          {m.analytics_event_picker_browse_catalog()}
        </Link>
      ) : null}
    </div>
  )
}

/**
 * 仅渲染 datalist —— 给 funnel 页用：每个 step 自己渲染 <Input list>，但
 * 共享同一个 listId，避免重复请求 + 重复渲染候选项。
 */
export function EventNameDatalist({
  listId,
  from,
  to,
}: {
  listId: string
  from: Date | string
  to: Date | string
}) {
  const { options } = useAnalyticsEventOptions({ from, to })
  return (
    <datalist id={listId}>
      {options.map((opt) => (
        <option key={opt.event} value={opt.event}>
          {formatLabel(opt)}
        </option>
      ))}
    </datalist>
  )
}

function formatLabel(opt: {
  event: string
  c: number | null
  inCatalog: boolean
  kind: string | null
  owner: string | null
}): string {
  const parts: string[] = [opt.event]
  if (opt.c !== null && opt.c > 0) {
    parts.push(Number(opt.c).toLocaleString())
  }
  if (opt.inCatalog) {
    if (opt.c === null) {
      parts.push(m.analytics_event_picker_no_data())
    } else if (opt.owner) {
      parts.push(opt.owner)
    } else if (opt.kind === "platform-event" || opt.kind === "http-request") {
      parts.push("platform")
    }
  } else {
    parts.push(m.analytics_event_picker_unregistered())
  }
  return parts.join("  ·  ")
}
