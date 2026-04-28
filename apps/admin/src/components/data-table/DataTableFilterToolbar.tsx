/**
 * Faceted filter toolbar — renders one control per `FilterDef` and
 * the `[Basic | Advanced]` mode toggle. Designed to slot above the
 * standard `<DataTable />` body.
 *
 * Wiring: every list page passes the same `filterDefs` to both
 * `useListSearch` and `<DataTable />`. The hook owns state, this
 * component owns rendering.
 *
 * The toggle hides itself when no filters are configured (a list
 * page with only `?q=` search has no use for advanced mode).
 */

import { XIcon } from "lucide-react"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { DateRangePicker } from "#/components/ui/date-range-picker"
import { MultiSelect } from "#/components/ui/multi-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group"
import type { FilterDef, FilterValue } from "#/hooks/use-list-search"
import { cn } from "#/lib/utils"

interface Props {
  filterDefs: FilterDef[]
  filterValues: Record<string, FilterValue["value"]>
  onFilterChange: (id: string, value: FilterValue["value"]) => void
  onResetFilters: () => void
  hasActiveFilters: boolean
  activeFilterCount: number

  mode: "basic" | "advanced"
  onModeChange: (mode: "basic" | "advanced") => void
  /**
   * When false, the Basic/Advanced toggle is hidden — the page only
   * supports faceted filters. Use for modules where advanced mode
   * adds no value (single column, no custom expressions).
   */
  showAdvancedToggle?: boolean

  className?: string
}

/**
 * Slot 1 of the table toolbar (the leftmost row, next to the search
 * input which is rendered by `<DataTable />`). Returns null when there
 * are no filters AND no toggle to show, so the toolbar collapses cleanly.
 */
export function DataTableFilterToolbar({
  filterDefs,
  filterValues,
  onFilterChange,
  onResetFilters,
  hasActiveFilters,
  activeFilterCount,
  mode,
  onModeChange,
  showAdvancedToggle = true,
  className,
}: Props) {
  if (filterDefs.length === 0 && !showAdvancedToggle) return null

  // Advanced mode owns its own filter UI (the QueryBuilder) — hide
  // the per-field facets to avoid two filter UIs racing.
  const showFacets = mode === "basic"

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        className,
      )}
    >
      {showFacets
        ? filterDefs.map((def) => (
            <FilterControl
              key={def.id}
              def={def}
              value={filterValues[def.id]}
              onChange={(v) => onFilterChange(def.id, v)}
            />
          ))
        : null}

      {showFacets && hasActiveFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onResetFilters}
          className="h-8 px-2 lg:px-3"
        >
          Reset
          {activeFilterCount > 0 ? (
            <Badge variant="secondary" className="ml-2 rounded-sm px-1 font-normal">
              {activeFilterCount}
            </Badge>
          ) : null}
          <XIcon className="ml-2 size-3" />
        </Button>
      ) : null}

      {showAdvancedToggle && filterDefs.length > 0 ? (
        <ToggleGroup
          size="sm"
          // base-ui ToggleGroup `value` 严格 readonly string[]；single 模式
          // 用 multiple={false}（默认）+ 数组首项。
          value={[mode]}
          onValueChange={(v) => {
            const next = v[0]
            if (next === "basic" || next === "advanced") onModeChange(next)
          }}
          className="ml-auto h-8"
        >
          <ToggleGroupItem value="basic" className="h-8 px-3 text-xs">
            Basic
          </ToggleGroupItem>
          <ToggleGroupItem value="advanced" className="h-8 px-3 text-xs">
            Advanced
          </ToggleGroupItem>
        </ToggleGroup>
      ) : null}
    </div>
  )
}

// ─── Per-filter renderer ─────────────────────────────────────────────

function FilterControl({
  def,
  value,
  onChange,
}: {
  def: FilterDef
  value: FilterValue["value"]
  onChange: (next: FilterValue["value"]) => void
}) {
  switch (def.type) {
    case "select": {
      const v = typeof value === "string" ? value : ""
      return (
        <Select
          value={v}
          onValueChange={(next) => onChange(!next || next === "__all__" ? undefined : next)}
        >
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder={def.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            {def.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    case "multiselect": {
      const arr = Array.isArray(value) ? value : []
      return (
        <MultiSelect
          label={def.label}
          options={def.options}
          selected={arr}
          onChange={(next) =>
            onChange(next.length === 0 ? undefined : next)
          }
          searchPlaceholder={def.options.length > 8 ? def.label : undefined}
        />
      )
    }
    case "boolean": {
      const trueLabel = def.trueLabel ?? "True"
      const falseLabel = def.falseLabel ?? "False"
      const v = value === true ? "true" : value === false ? "false" : ""
      return (
        <Select
          value={v}
          onValueChange={(next) => {
            if (next === "__all__") onChange(undefined)
            else if (next === "true") onChange(true)
            else if (next === "false") onChange(false)
          }}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder={def.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            <SelectItem value="true">{trueLabel}</SelectItem>
            <SelectItem value="false">{falseLabel}</SelectItem>
          </SelectContent>
        </Select>
      )
    }
    case "dateRange": {
      const v = (value ?? undefined) as { gte?: string; lte?: string } | undefined
      return (
        <DateRangePicker
          label={def.label}
          value={v}
          onChange={(next) => onChange(next)}
        />
      )
    }
    case "numberRange": {
      // Reuse DateRangePicker for visual consistency? No — number range
      // needs two inputs. Inline minimal pair.
      const v =
        (value ?? undefined) as { gte?: number; lte?: number } | undefined
      return (
        <div className="flex items-center gap-1">
          <input
            type="number"
            placeholder={`${def.label} ≥`}
            value={v?.gte ?? ""}
            onChange={(e) => {
              const n = e.target.value === "" ? undefined : Number(e.target.value)
              const next = {
                gte: Number.isFinite(n) ? n : undefined,
                lte: v?.lte,
              }
              if (next.gte === undefined && next.lte === undefined) onChange(undefined)
              else onChange(next)
            }}
            className="h-8 w-24 rounded-md border bg-background px-2 text-xs"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="number"
            placeholder="≤"
            value={v?.lte ?? ""}
            onChange={(e) => {
              const n = e.target.value === "" ? undefined : Number(e.target.value)
              const next = {
                gte: v?.gte,
                lte: Number.isFinite(n) ? n : undefined,
              }
              if (next.gte === undefined && next.lte === undefined) onChange(undefined)
              else onChange(next)
            }}
            className="h-8 w-24 rounded-md border bg-background px-2 text-xs"
          />
        </div>
      )
    }
  }
}
