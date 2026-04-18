import { useMemo } from "react"
import { useCurrencies } from "#/hooks/use-currency"
import { useEntityBlueprints } from "#/hooks/use-entity"
import { useItemDefinitions } from "#/hooks/use-item"
import type { RewardType } from "#/lib/types/rewards"

export interface RewardCatalogOption {
  id: string
  name: string
  alias: string | null
  icon: string | null
}

/**
 * One-stop catalog for the `<RewardEntryEditor>` dropdown.
 *
 * Fetches item definitions, currency definitions, and entity blueprints
 * in parallel (each hook is cached independently). The returned
 * `byType` resolves a `RewardType` to the matching option list — the
 * editor uses this to populate its second dropdown once the user picks
 * a type in the first one.
 *
 * `resolveLabel(type, id)` gives forms a cheap way to show the display
 * name for a saved entry without having to track three separate id-lookup
 * tables.
 */
export function useRewardCatalog() {
  const { data: items, isPending: itemsPending } = useItemDefinitions()
  const { data: currencies, isPending: currenciesPending } = useCurrencies()
  const { data: blueprints, isPending: entitiesPending } = useEntityBlueprints()

  const value = useMemo(() => {
    const itemOpts: RewardCatalogOption[] = (items ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      alias: d.alias,
      icon: d.icon,
    }))
    const currencyOpts: RewardCatalogOption[] = (currencies ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      alias: d.alias,
      icon: d.icon,
    }))
    const entityOpts: RewardCatalogOption[] = (blueprints ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      alias: b.alias,
      icon: b.icon,
    }))

    const byType: Record<RewardType, RewardCatalogOption[]> = {
      item: itemOpts,
      currency: currencyOpts,
      entity: entityOpts,
    }

    const indexByType: Record<RewardType, Map<string, RewardCatalogOption>> = {
      item: new Map(itemOpts.map((o) => [o.id, o])),
      currency: new Map(currencyOpts.map((o) => [o.id, o])),
      entity: new Map(entityOpts.map((o) => [o.id, o])),
    }

    function resolveLabel(type: RewardType, id: string): string {
      return indexByType[type].get(id)?.name ?? id.slice(0, 8)
    }

    return { byType, resolveLabel }
  }, [items, currencies, blueprints])

  return {
    ...value,
    isPending: itemsPending || currenciesPending || entitiesPending,
  }
}
