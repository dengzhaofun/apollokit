import { SearchIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Input } from "#/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { cn } from "#/lib/utils"

export interface FilterOption {
  value: string
  label: string
}

export interface FilterConfig {
  key: string
  label: string
  value: string
  onChange: (value: string) => void
  options: FilterOption[]
  /** 清空选项的 value，默认 "all" */
  allValue?: string
}

type SelectChangeHandler = (value: string | null, ...args: unknown[]) => void

export interface FilterBarProps {
  search?: {
    value: string
    onChange: (value: string) => void
    placeholder?: string
  }
  filters?: FilterConfig[]
  /** 右侧 action 按钮区（如 Export CSV） */
  actions?: ReactNode
  className?: string
}

/**
 * 通用筛选条 —— 搜索框 + 若干下拉筛选 + 右侧 action 按钮。
 * 用于 MembersTable、任何列表页顶部。
 */
export function FilterBar({ search, filters = [], actions, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        className
      )}
    >
      {search && (
        <div className="relative min-w-0 flex-1 basis-48">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? "Search…"}
            className="pl-8"
          />
        </div>
      )}

      {filters.map((filter) => (
        <Select
          key={filter.key}
          value={filter.value}
          onValueChange={((v: string | null) => filter.onChange(v ?? filter.allValue ?? "all")) as SelectChangeHandler}
        >
          <SelectTrigger className="w-auto min-w-[120px] shrink-0">
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={filter.allValue ?? "all"}>
              {filter.label}
            </SelectItem>
            {filter.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {actions && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}
