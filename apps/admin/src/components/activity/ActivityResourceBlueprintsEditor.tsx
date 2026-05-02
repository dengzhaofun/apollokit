import { Plus, Trash2 } from "lucide-react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import * as m from "#/paraglide/messages.js"

/**
 * Visual editor for the three "per-cycle resource blueprint" arrays on
 * an activity template (currencies / item_definitions / entity_blueprints).
 *
 * Each row only edits the bare-minimum fields needed for instantiation —
 * advanced metadata (statGrowth, levelUpCosts, …) is intentionally left
 * out of this MVP and lives in `metadata` jsonb (editable via API or a
 * future "advanced" toggle). The point is to make the common case (run a
 * weekly tournament with a season-token currency that resets each cycle)
 * a few clicks instead of hand-writing JSON.
 *
 * Wire shape stays identical to server validators in
 * `apps/server/src/modules/activity/validators.ts`:
 *   - ActivityCurrencyBlueprint:        { aliasPattern, name, icon? }
 *   - ActivityItemDefinitionBlueprint:  { aliasPattern, name, icon?, stackable? }
 *   - ActivityEntityBlueprintBlueprint: { aliasPattern, schemaAlias, name, rarity? }
 */

export interface CurrencyBlueprintRow {
  aliasPattern: string
  name: string
  icon?: string | null
}

export interface ItemBlueprintRow {
  aliasPattern: string
  name: string
  icon?: string | null
  stackable?: boolean
}

export interface EntityBlueprintRow {
  aliasPattern: string
  schemaAlias: string
  name: string
  rarity?: string | null
}

interface Props {
  currencies: CurrencyBlueprintRow[]
  itemDefinitions: ItemBlueprintRow[]
  entityBlueprints: EntityBlueprintRow[]
  onChange: (next: {
    currencies: CurrencyBlueprintRow[]
    itemDefinitions: ItemBlueprintRow[]
    entityBlueprints: EntityBlueprintRow[]
  }) => void
}

export function ActivityResourceBlueprintsEditor({
  currencies,
  itemDefinitions,
  entityBlueprints,
  onChange,
}: Props) {
  function setCurrencies(next: CurrencyBlueprintRow[]) {
    onChange({ currencies: next, itemDefinitions, entityBlueprints })
  }
  function setItems(next: ItemBlueprintRow[]) {
    onChange({ currencies, itemDefinitions: next, entityBlueprints })
  }
  function setEntities(next: EntityBlueprintRow[]) {
    onChange({ currencies, itemDefinitions, entityBlueprints: next })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Currencies */}
      <Section
        title={m.activity_template_blueprints_currencies_title()}
        hint={m.activity_template_blueprints_currencies_hint()}
        empty={m.activity_template_blueprints_empty()}
        addLabel={m.activity_template_blueprints_add_currency()}
        rows={currencies}
        onAdd={() =>
          setCurrencies([
            ...currencies,
            {
              aliasPattern: `season_coin_{year}_W{week}`,
              name: `Season Coin`,
            },
          ])
        }
      >
        {currencies.map((row, idx) => (
          <BlueprintRow
            key={idx}
            onRemove={() =>
              setCurrencies(currencies.filter((_, i) => i !== idx))
            }
          >
            <RowInput
              label={m.activity_template_blueprints_alias_pattern()}
              value={row.aliasPattern}
              placeholder="season_coin_{year}_W{week}"
              onChange={(v) =>
                setCurrencies(
                  currencies.map((r, i) =>
                    i === idx ? { ...r, aliasPattern: v } : r,
                  ),
                )
              }
            />
            <RowInput
              label={m.activity_template_blueprints_name()}
              value={row.name}
              onChange={(v) =>
                setCurrencies(
                  currencies.map((r, i) =>
                    i === idx ? { ...r, name: v } : r,
                  ),
                )
              }
            />
            <RowInput
              label={m.activity_template_blueprints_icon()}
              value={row.icon ?? ""}
              placeholder="https://..."
              onChange={(v) =>
                setCurrencies(
                  currencies.map((r, i) =>
                    i === idx ? { ...r, icon: v || null } : r,
                  ),
                )
              }
            />
          </BlueprintRow>
        ))}
      </Section>

      {/* Item definitions */}
      <Section
        title={m.activity_template_blueprints_items_title()}
        hint={m.activity_template_blueprints_items_hint()}
        empty={m.activity_template_blueprints_empty()}
        addLabel={m.activity_template_blueprints_add_item()}
        rows={itemDefinitions}
        onAdd={() =>
          setItems([
            ...itemDefinitions,
            {
              aliasPattern: `season_ticket_{year}_W{week}`,
              name: `Season Ticket`,
              stackable: true,
            },
          ])
        }
      >
        {itemDefinitions.map((row, idx) => (
          <BlueprintRow
            key={idx}
            onRemove={() =>
              setItems(itemDefinitions.filter((_, i) => i !== idx))
            }
          >
            <RowInput
              label={m.activity_template_blueprints_alias_pattern()}
              value={row.aliasPattern}
              placeholder="season_ticket_{year}_W{week}"
              onChange={(v) =>
                setItems(
                  itemDefinitions.map((r, i) =>
                    i === idx ? { ...r, aliasPattern: v } : r,
                  ),
                )
              }
            />
            <RowInput
              label={m.activity_template_blueprints_name()}
              value={row.name}
              onChange={(v) =>
                setItems(
                  itemDefinitions.map((r, i) =>
                    i === idx ? { ...r, name: v } : r,
                  ),
                )
              }
            />
            <RowInput
              label={m.activity_template_blueprints_icon()}
              value={row.icon ?? ""}
              placeholder="https://..."
              onChange={(v) =>
                setItems(
                  itemDefinitions.map((r, i) =>
                    i === idx ? { ...r, icon: v || null } : r,
                  ),
                )
              }
            />
          </BlueprintRow>
        ))}
      </Section>

      {/* Entity blueprints */}
      <Section
        title={m.activity_template_blueprints_entities_title()}
        hint={m.activity_template_blueprints_entities_hint()}
        empty={m.activity_template_blueprints_empty()}
        addLabel={m.activity_template_blueprints_add_entity()}
        rows={entityBlueprints}
        onAdd={() =>
          setEntities([
            ...entityBlueprints,
            {
              aliasPattern: `season_skin_{year}_W{week}`,
              schemaAlias: "hero",
              name: `Season Skin`,
            },
          ])
        }
      >
        {entityBlueprints.map((row, idx) => (
          <BlueprintRow
            key={idx}
            onRemove={() =>
              setEntities(entityBlueprints.filter((_, i) => i !== idx))
            }
          >
            <RowInput
              label={m.activity_template_blueprints_alias_pattern()}
              value={row.aliasPattern}
              onChange={(v) =>
                setEntities(
                  entityBlueprints.map((r, i) =>
                    i === idx ? { ...r, aliasPattern: v } : r,
                  ),
                )
              }
            />
            <RowInput
              label={m.activity_template_blueprints_schema_alias()}
              value={row.schemaAlias}
              placeholder="hero"
              onChange={(v) =>
                setEntities(
                  entityBlueprints.map((r, i) =>
                    i === idx ? { ...r, schemaAlias: v } : r,
                  ),
                )
              }
            />
            <RowInput
              label={m.activity_template_blueprints_name()}
              value={row.name}
              onChange={(v) =>
                setEntities(
                  entityBlueprints.map((r, i) =>
                    i === idx ? { ...r, name: v } : r,
                  ),
                )
              }
            />
            <RowInput
              label={m.activity_template_blueprints_rarity()}
              value={row.rarity ?? ""}
              placeholder="legendary"
              onChange={(v) =>
                setEntities(
                  entityBlueprints.map((r, i) =>
                    i === idx ? { ...r, rarity: v || null } : r,
                  ),
                )
              }
            />
          </BlueprintRow>
        ))}
      </Section>
    </div>
  )
}

function Section({
  title,
  hint,
  empty,
  addLabel,
  rows,
  onAdd,
  children,
}: {
  title: string
  hint: string
  empty: string
  addLabel: string
  rows: unknown[]
  onAdd: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <Label className="text-sm font-semibold">{title}</Label>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
      <div className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">{empty}</p>
        ) : (
          children
        )}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={onAdd}>
            <Plus className="size-4" />
            {addLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function BlueprintRow({
  onRemove,
  children,
}: {
  onRemove: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex items-end gap-2 rounded-md border bg-card p-3">
      <div className="grid flex-1 grid-cols-2 gap-2 lg:grid-cols-4">
        {children}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label="remove"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

function RowInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
