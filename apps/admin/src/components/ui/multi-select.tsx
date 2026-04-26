"use client"

/**
 * Faceted multi-select — the popover-with-checkbox-list pattern used
 * for column filters in the shadcn/ui tasks example.
 *
 * Designed for two call sites: the DataTable filter toolbar (filter by
 * status/category/etc) and any future place that needs a compact
 * multi-pick UI (say, role assignment in member screens).
 *
 * The component is fully controlled — the parent owns the selected
 * `string[]`. Selection state is keyed by stable `value`, so option
 * labels can change without losing the user's picks.
 *
 * The trigger renders as an outline button showing the filter label,
 * and chips for the first N selected values; remaining picks collapse
 * into a `+M` indicator. This keeps long facet lists from overflowing
 * the toolbar.
 */

import { CheckIcon, PlusCircleIcon } from "lucide-react"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "#/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover"
import { Separator } from "#/components/ui/separator"
import { cn } from "#/lib/utils"

export type MultiSelectOption = {
  label: string
  value: string
  /** Optional left-side icon, e.g. `<CheckCircle2 />`. */
  icon?: React.ComponentType<{ className?: string }>
}

interface Props {
  label: string
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  /** Show "Clear" footer when at least one option is selected. */
  showClear?: boolean
  /** Max chips before collapsing into `+N more`. Default 2. */
  maxChips?: number
  /** Search box placeholder; if absent, no search box renders. */
  searchPlaceholder?: string
  /** Empty-state copy when search yields nothing. */
  emptyText?: string
  className?: string
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  showClear = true,
  maxChips = 2,
  searchPlaceholder,
  emptyText = "No results.",
  className,
}: Props) {
  const selectedSet = new Set(selected)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 border-dashed", className)}
        >
          <PlusCircleIcon className="mr-2 size-4" />
          {label}
          {selected.length > 0 ? (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-normal lg:hidden"
              >
                {selected.length}
              </Badge>
              <div className="hidden items-center gap-1 lg:flex">
                {selected.length > maxChips ? (
                  <Badge
                    variant="secondary"
                    className="rounded-sm px-1 font-normal"
                  >
                    {selected.length} selected
                  </Badge>
                ) : (
                  options
                    .filter((o) => selectedSet.has(o.value))
                    .map((o) => (
                      <Badge
                        key={o.value}
                        variant="secondary"
                        className="rounded-sm px-1 font-normal"
                      >
                        {o.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          {searchPlaceholder ? (
            <CommandInput placeholder={searchPlaceholder} />
          ) : null}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedSet.has(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      const next = isSelected
                        ? selected.filter((v) => v !== option.value)
                        : [...selected, option.value]
                      onChange(next)
                    }}
                  >
                    <div
                      className={cn(
                        "mr-2 flex size-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <CheckIcon className="size-3" />
                    </div>
                    {option.icon ? (
                      <option.icon className="mr-2 size-4 text-muted-foreground" />
                    ) : null}
                    <span>{option.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {showClear && selected.length > 0 ? (
              <>
                <Separator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => onChange([])}
                    className="justify-center text-center"
                  >
                    Clear
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
