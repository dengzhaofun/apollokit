/**
 * Advanced filter shell — renders the QueryBuilder when the table is
 * in advanced mode, plus a hint about how to leave / clear it.
 *
 * The component is a pure controlled wrapper around `<QueryBuilder />`
 * — it doesn't decide visibility (the parent already conditions on
 * `mode === "advanced"`) and doesn't talk to the URL (the parent's
 * `setAdvanced` does that).
 */

import { Trash2Icon } from "lucide-react"

import { Button } from "#/components/ui/button"
import {
  QueryBuilder,
  type RuleGroupType,
} from "#/components/ui/query-builder"
import type { FilterDef } from "#/hooks/use-list-search"

interface Props {
  filterDefs: FilterDef[]
  query: RuleGroupType | undefined
  onChange: (next: RuleGroupType) => void
  /** Switches mode back to "basic" — typically `setMode("basic")`. */
  onClear: () => void
}

export function DataTableAdvancedFilter({
  filterDefs,
  query,
  onChange,
  onClear,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Advanced — combine fields with AND/OR. Switch to Basic to use the faceted filters.
        </p>
        <Button variant="ghost" size="sm" onClick={onClear} className="h-7 px-2 text-xs">
          <Trash2Icon className="mr-1 size-3" />
          Clear
        </Button>
      </div>
      <QueryBuilder
        filterDefs={filterDefs}
        query={query}
        onChange={onChange}
      />
    </div>
  )
}
