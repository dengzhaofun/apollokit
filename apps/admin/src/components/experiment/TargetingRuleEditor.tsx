/**
 * Targeting rule builder UI.
 *
 * Composes flat AND/OR groups of `(attribute, operator, value)` rows
 * — the v1.5 supported shape (see `lib/targeting/jsonlogic-builder.ts`).
 *
 * Two modes via radio:
 *   - "all"     → emits `{}`, every user matches, no rule
 *   - "match"   → emits the AND/OR JSONLogic tree derived from the rows
 *
 * If the experiment was loaded with a rule that doesn't fit the
 * builder shape (manual edit / API import), we render a read-only
 * notice instead of silently destroying it on save.
 */

import { Plus, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Switch } from "#/components/ui/switch"
import {
  ALL_OPERATORS,
  DEFAULT_ATTRIBUTES,
  EMPTY_BUILDER,
  isEmptyRule,
  serialize,
  tryDeserialize,
  type BuilderCondition,
  type BuilderState,
  type Operator,
} from "#/lib/targeting/jsonlogic-builder"
import type { ExperimentTargetingRules } from "#/lib/types/experiment"
import * as m from "#/paraglide/messages.js"

interface Props {
  /** Current rule (from experiment.targetingRules). */
  value: ExperimentTargetingRules
  /** Called whenever the user edits the rule. Pass null/`{}` for "match all". */
  onChange: (next: ExperimentTargetingRules) => void
  /** Disable all controls (e.g. while a save mutation is pending). */
  disabled?: boolean
}

function operatorLabel(op: Operator): string {
  return {
    equals: m.experiment_targeting_op_equals(),
    not_equals: m.experiment_targeting_op_not_equals(),
    in: m.experiment_targeting_op_in(),
    not_in: m.experiment_targeting_op_not_in(),
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
    contains: m.experiment_targeting_op_contains(),
  }[op]
}

function isMultiValue(op: Operator): boolean {
  return op === "in" || op === "not_in"
}

function isNumeric(op: Operator): boolean {
  return op === "gt" || op === "gte" || op === "lt" || op === "lte"
}

export function TargetingRuleEditor({ value, onChange, disabled }: Props) {
  const initial = useMemo(() => tryDeserialize(value), [value])
  const supported = initial !== null

  // Local builder state — initialised from the saved rule, only emits
  // back to parent on real edits to avoid render loops.
  const [state, setState] = useState<BuilderState>(initial ?? EMPTY_BUILDER)
  const [matchAll, setMatchAll] = useState<boolean>(isEmptyRule(value))

  // Re-sync if `value` prop changes externally (e.g. parent reloads).
  useEffect(() => {
    const fresh = tryDeserialize(value)
    if (fresh) setState(fresh)
    setMatchAll(isEmptyRule(value))
  }, [value])

  function emit(nextState: BuilderState, nextMatchAll: boolean) {
    setState(nextState)
    setMatchAll(nextMatchAll)
    if (nextMatchAll || nextState.conditions.length === 0) {
      onChange({})
    } else {
      onChange(serialize(nextState))
    }
  }

  function setJoiner(j: BuilderState["joiner"]) {
    emit({ ...state, joiner: j }, matchAll)
  }
  function addCondition() {
    emit(
      {
        ...state,
        conditions: [
          ...state.conditions,
          { attribute: "country", operator: "equals", value: "" },
        ],
      },
      false,
    )
  }
  function removeCondition(i: number) {
    const next = state.conditions.filter((_, idx) => idx !== i)
    emit({ ...state, conditions: next }, next.length === 0)
  }
  function patchCondition(i: number, patch: Partial<BuilderCondition>) {
    const next = state.conditions.map((c, idx) =>
      idx === i ? { ...c, ...patch } : c,
    )
    emit({ ...state, conditions: next }, false)
  }

  // Read-only fallback for foreign rules.
  if (!supported) {
    return (
      <div className="rounded-md border border-dashed bg-muted/40 p-3 text-sm">
        <p className="font-medium">
          {m.experiment_targeting_unsupported_title()}
        </p>
        <p className="mt-1 text-muted-foreground">
          {m.experiment_targeting_unsupported_body()}
        </p>
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-background p-2 text-[10px]">
          {JSON.stringify(value, null, 2)}
        </pre>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
        <div>
          <Label className="text-sm">
            {m.experiment_targeting_match_all_label()}
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {m.experiment_targeting_match_all_hint()}
          </p>
        </div>
        <Switch
          checked={matchAll}
          onCheckedChange={(v) => emit(state, v)}
          disabled={disabled}
        />
      </div>

      {!matchAll && (
        <div className="space-y-3 rounded-md border p-3">
          {state.conditions.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{m.experiment_targeting_join_label()}:</span>
              <Select
                value={state.joiner}
                onValueChange={(v) => setJoiner(v as BuilderState["joiner"])}
                disabled={disabled}
              >
                <SelectTrigger className="h-7 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="and">
                    {m.experiment_targeting_join_and()}
                  </SelectItem>
                  <SelectItem value="or">
                    {m.experiment_targeting_join_or()}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {state.conditions.map((cond, i) => (
            <ConditionRow
              key={i}
              cond={cond}
              disabled={disabled}
              onChange={(patch) => patchCondition(i, patch)}
              onRemove={() => removeCondition(i)}
            />
          ))}

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addCondition}
            disabled={disabled}
          >
            <Plus className="size-4" />
            {m.experiment_targeting_add_condition()}
          </Button>

          {state.conditions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {m.experiment_targeting_empty_hint()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ConditionRow({
  cond,
  disabled,
  onChange,
  onRemove,
}: {
  cond: BuilderCondition
  disabled?: boolean
  onChange: (patch: Partial<BuilderCondition>) => void
  onRemove: () => void
}) {
  const showAttrList = "exp-attr-list"
  const valueAsString = Array.isArray(cond.value)
    ? cond.value.join(", ")
    : String(cond.value ?? "")

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        list={showAttrList}
        value={cond.attribute}
        onChange={(e) => onChange({ attribute: e.target.value.trim() })}
        placeholder="country"
        disabled={disabled}
        className="h-8 w-44 font-mono text-xs"
      />
      <datalist id={showAttrList}>
        {DEFAULT_ATTRIBUTES.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>

      <Select
        value={cond.operator}
        onValueChange={(v) => onChange({ operator: v as Operator })}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ALL_OPERATORS.map((op) => (
            <SelectItem key={op} value={op}>
              {operatorLabel(op)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={valueAsString}
        onChange={(e) =>
          onChange({
            value: isNumeric(cond.operator)
              ? Number(e.target.value)
              : e.target.value,
          })
        }
        placeholder={
          isMultiValue(cond.operator)
            ? "JP, KR, TW"
            : isNumeric(cond.operator)
              ? "30"
              : "free"
        }
        disabled={disabled}
        className="h-8 flex-1 min-w-[120px]"
      />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        className="size-8"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}
