import { Trash2 } from "lucide-react"
import { useState } from "react"

import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import type {
  CreateRankTierConfigInput,
  RankTierConfig,
  RankTierInput,
} from "#/lib/types/rank"
import * as m from "#/paraglide/messages.js"

interface Props {
  initial?: RankTierConfig
  submitLabel: string
  isPending: boolean
  onSubmit: (values: CreateRankTierConfigInput) => Promise<void> | void
}

function defaultTier(order: number): RankTierInput {
  const base = order * 1000
  return {
    alias: `tier_${order}`,
    name: `Tier ${order + 1}`,
    order,
    minRankScore: base,
    maxRankScore: order === 2 ? null : base + 999,
    subtierCount: 3,
    starsPerSubtier: 5,
    protectionRules: {},
  }
}

function seedInitialTiers(): RankTierInput[] {
  return [
    {
      alias: "bronze",
      name: "Bronze",
      order: 0,
      minRankScore: 0,
      maxRankScore: 999,
      subtierCount: 3,
      starsPerSubtier: 5,
      protectionRules: {},
    },
    {
      alias: "silver",
      name: "Silver",
      order: 1,
      minRankScore: 1000,
      maxRankScore: 1999,
      subtierCount: 3,
      starsPerSubtier: 5,
      protectionRules: {},
    },
    {
      alias: "gold",
      name: "Gold",
      order: 2,
      minRankScore: 2000,
      maxRankScore: null,
      subtierCount: 3,
      starsPerSubtier: 5,
      protectionRules: {},
    },
  ]
}

export function TierConfigForm({
  initial,
  submitLabel,
  isPending,
  onSubmit,
}: Props) {
  const [alias, setAlias] = useState(initial?.alias ?? "")
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [baseK, setBaseK] = useState<number>(
    (initial?.ratingParams?.baseK as number | undefined) ?? 32,
  )
  const [initialMmr, setInitialMmr] = useState<number>(
    (initial?.ratingParams?.initialMmr as number | undefined) ?? 1000,
  )
  const [perfWeight, setPerfWeight] = useState<number>(
    (initial?.ratingParams?.perfWeight as number | undefined) ?? 0,
  )
  const [tiers, setTiers] = useState<RankTierInput[]>(
    initial?.tiers
      ? initial.tiers.map((t) => ({
          alias: t.alias,
          name: t.name,
          order: t.order,
          minRankScore: t.minRankScore,
          maxRankScore: t.maxRankScore,
          subtierCount: t.subtierCount,
          starsPerSubtier: t.starsPerSubtier,
          protectionRules: t.protectionRules,
        }))
      : seedInitialTiers(),
  )

  function updateTier(index: number, patch: Partial<RankTierInput>) {
    setTiers((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    )
  }

  function updateTierProtection(
    index: number,
    key: keyof NonNullable<RankTierInput["protectionRules"]>,
    value: number | undefined,
  ) {
    setTiers((prev) =>
      prev.map((t, i) => {
        if (i !== index) return t
        const rules = { ...(t.protectionRules ?? {}) }
        if (value === undefined || Number.isNaN(value)) {
          delete rules[key]
        } else {
          rules[key] = value
        }
        return { ...t, protectionRules: rules }
      }),
    )
  }

  function addTier() {
    setTiers((prev) => [...prev, defaultTier(prev.length)])
  }

  function removeTier(index: number) {
    setTiers((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((t, i) => ({ ...t, order: i })),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      alias,
      name,
      description: description || null,
      isActive,
      ratingParams: {
        strategy: "elo",
        teamMode: "avgTeamElo",
        baseK,
        initialMmr,
        ...(perfWeight > 0 ? { perfWeight } : {}),
      },
      tiers,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Identity */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="alias" className="inline-flex items-center gap-1.5">
            {m.rank_config_alias()}
            <FieldHint>{m.rank_config_alias_help()}</FieldHint>
          </Label>
          <Input
            id="alias"
            required
            pattern="[a-z0-9][a-z0-9\-_]*"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder={m.rank_config_alias_placeholder()}
            disabled={!!initial}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">{m.rank_config_name()}</Label>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={m.rank_config_name_placeholder()}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">{m.rank_config_description()}</Label>
        <Textarea
          id="description"
          rows={2}
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="active"
          checked={isActive}
          onCheckedChange={setIsActive}
        />
        <Label htmlFor="active">{m.rank_config_active()}</Label>
      </div>

      {/* Rating params */}
      <div className="space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">
          {m.rank_config_rating_params()}
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="baseK" className="inline-flex items-center gap-1.5">
              {m.rank_config_base_k()}
              <FieldHint>{m.rank_config_base_k_help()}</FieldHint>
            </Label>
            <Input
              id="baseK"
              type="number"
              min={1}
              max={200}
              value={baseK}
              onChange={(e) => setBaseK(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="initialMmr">{m.rank_config_initial_mmr()}</Label>
            <Input
              id="initialMmr"
              type="number"
              min={0}
              max={10_000}
              value={initialMmr}
              onChange={(e) => setInitialMmr(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="perfWeight" className="inline-flex items-center gap-1.5">
              {m.rank_config_perf_weight()}
              <FieldHint>{m.rank_config_perf_weight_help()}</FieldHint>
            </Label>
            <Input
              id="perfWeight"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={perfWeight}
              onChange={(e) => setPerfWeight(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Tiers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{m.rank_config_tiers()}</h3>
          <Button type="button" size="sm" variant="outline" onClick={addTier}>
            + {m.rank_config_tier_add()}
          </Button>
        </div>
        <div className="space-y-3">
          {tiers.map((t, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">
                  #{t.order} {t.name}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeTier(i)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">{m.rank_tier_alias()}</Label>
                  <Input
                    required
                    pattern="[a-z0-9][a-z0-9\-_]*"
                    value={t.alias}
                    onChange={(e) => updateTier(i, { alias: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{m.rank_tier_name()}</Label>
                  <Input
                    required
                    value={t.name}
                    onChange={(e) => updateTier(i, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{m.rank_tier_order()}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={t.order}
                    onChange={(e) =>
                      updateTier(i, { order: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{m.rank_tier_min_score()}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={t.minRankScore}
                    onChange={(e) =>
                      updateTier(i, { minRankScore: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{m.rank_tier_max_score()}</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder={m.rank_tier_max_score_help()}
                    value={t.maxRankScore ?? ""}
                    onChange={(e) =>
                      updateTier(i, {
                        maxRankScore:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {m.rank_tier_subtier_count()}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={t.subtierCount ?? 3}
                      onChange={(e) =>
                        updateTier(i, {
                          subtierCount: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {m.rank_tier_stars_per_subtier()}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={t.starsPerSubtier ?? 5}
                      onChange={(e) =>
                        updateTier(i, {
                          starsPerSubtier: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">
                    {m.rank_tier_protection_demotion_shield()}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={
                      typeof t.protectionRules?.demotionShieldMatches ===
                      "number"
                        ? t.protectionRules.demotionShieldMatches
                        : ""
                    }
                    onChange={(e) =>
                      updateTierProtection(
                        i,
                        "demotionShieldMatches",
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {m.rank_tier_protection_big_drop()}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={
                      typeof t.protectionRules?.bigDropShields === "number"
                        ? t.protectionRules.bigDropShields
                        : ""
                    }
                    onChange={(e) =>
                      updateTierProtection(
                        i,
                        "bigDropShields",
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {m.rank_tier_protection_win_streak()}
                  </Label>
                  <Input
                    type="number"
                    min={2}
                    max={20}
                    value={
                      typeof t.protectionRules?.winStreakBonusFrom === "number"
                        ? t.protectionRules.winStreakBonusFrom
                        : ""
                    }
                    onChange={(e) =>
                      updateTierProtection(
                        i,
                        "winStreakBonusFrom",
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                      )
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="submit" disabled={isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
