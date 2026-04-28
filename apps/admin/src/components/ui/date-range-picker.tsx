"use client"

/**
 * Faceted date-range picker — popover wrapping the existing
 * `<Calendar />` (react-day-picker `mode="range"`).
 *
 * Designed for the DataTable filter toolbar's `dateRange` filter type.
 * Fully controlled — parent owns `{ gte, lte }`. Both bounds are
 * optional; the picker emits whichever the user committed.
 *
 * The trigger button mirrors the look of `<MultiSelect />` so the
 * toolbar reads as a single visual row.
 */

import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import * as React from "react"
import type { DateRange } from "react-day-picker"

import { Button } from "#/components/ui/button"
import { Calendar } from "#/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover"
import { cn } from "#/lib/utils"

interface Props {
  label: string
  value: { gte?: string; lte?: string } | undefined
  onChange: (next: { gte?: string; lte?: string } | undefined) => void
  className?: string
}

const ISO_DATE = "yyyy-MM-dd"

function parseISO(s: string | undefined): Date | undefined {
  if (!s) return undefined
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function DateRangePicker({ label, value, onChange, className }: Props) {
  const range: DateRange | undefined = React.useMemo(
    () => ({ from: parseISO(value?.gte), to: parseISO(value?.lte) }),
    [value],
  )
  const hasValue = !!(range?.from || range?.to)

  const summary = React.useMemo(() => {
    if (range?.from && range?.to)
      return `${format(range.from, ISO_DATE)} → ${format(range.to, ISO_DATE)}`
    if (range?.from) return `≥ ${format(range.from, ISO_DATE)}`
    if (range?.to) return `≤ ${format(range.to, ISO_DATE)}`
    return null
  }, [range])

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 border-dashed", className)}
          >
            <CalendarIcon className="mr-2 size-4" />
            {label}
            {summary ? (
              <span className="ml-2 text-muted-foreground tabular-nums">
                {summary}
              </span>
            ) : null}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={range}
          onSelect={(next) => {
            if (!next) {
              onChange(undefined)
              return
            }
            const gte = next.from ? format(next.from, ISO_DATE) : undefined
            const lte = next.to ? format(next.to, ISO_DATE) : undefined
            if (!gte && !lte) onChange(undefined)
            else onChange({ gte, lte })
          }}
          autoFocus
        />
        {hasValue ? (
          <div className="flex items-center justify-end gap-2 border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(undefined)}
            >
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
