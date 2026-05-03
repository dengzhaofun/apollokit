import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  CreateCurrencyInput,
  CurrencyBalance,
  CurrencyDefinition,
  DeductCurrencyInput,
  DeductCurrencyResult,
  GrantCurrencyInput,
  GrantCurrencyResult,
  LedgerPage,
  LedgerQuery,
  UpdateCurrencyInput,
  WalletView,
} from "#/lib/types/currency"

const DEFINITIONS_KEY = ["currency-definitions"] as const
const WALLETS_KEY = ["currency-wallets"] as const
const LEDGER_KEY = ["currency-ledger"] as const

// ─── Definitions ──────────────────────────────────────────────────

/**
 * Filter defs for the currency-definitions list. Mirrors the server's
 * `currencyDefinitionFilters` (validators.ts).
 */
export const CURRENCY_FILTER_DEFS: FilterDef[] = [
  {
    id: "isActive",
    label: "Status",
    type: "boolean",
    trueLabel: "Active",
    falseLabel: "Inactive",
  },
]

/**
 * URL-driven currencies list — wired into <DataTable />.
 *
 * Default scope: only permanent / non-activity-bound currencies. Activity-
 * scoped currencies are managed inside the activity's own detail page.
 * The list page intentionally does not expose an "Activity" filter —
 * separating "global catalog" from "activity inner loop" prevents the
 * two workflows from leaking into each other.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useCurrencies(route: any) {
  return useListSearch<CurrencyDefinition>({
    route,
    queryKey: DEFINITIONS_KEY,
    filterDefs: CURRENCY_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<CurrencyDefinition>>(
        `/api/v1/currency/definitions?${buildQs({
          cursor,
          limit,
          q,
          adv,
          activityId: "null",
          ...filters,
        })}`,
      ),
  })
}

/** Non-paginated convenience for selectors (limit 200 server-cap). */
export function useAllCurrencies(
  opts: { activityId?: string | null; isActive?: boolean } = {},
) {
  const { activityId, isActive } = opts
  return useQuery({
    queryKey: [...DEFINITIONS_KEY, "all", { activityId: activityId ?? null, isActive: isActive ?? null }],
    queryFn: () =>
      api
        .get<Page<CurrencyDefinition>>(
          `/api/v1/currency/definitions?${buildQs({
            limit: 200,
            activityId: activityId === null ? "" : activityId,
            isActive: isActive == null ? undefined : isActive ? "true" : "false",
          })}`,
        )
        .then((p) => p.items),
  })
}

export function useCurrency(key: string) {
  return useQuery({
    queryKey: [...DEFINITIONS_KEY, key],
    queryFn: () =>
      api.get<CurrencyDefinition>(`/api/v1/currency/definitions/${key}`),
    enabled: !!key,
  })
}

export function useCreateCurrency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCurrencyInput) =>
      api.post<CurrencyDefinition>("/api/v1/currency/definitions", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY }),
  })
}

export function useUpdateCurrency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCurrencyInput & { id: string }) =>
      api.patch<CurrencyDefinition>(`/api/v1/currency/definitions/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY }),
  })
}

export function useDeleteCurrency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/currency/definitions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY }),
  })
}

// ─── Wallets / balances ──────────────────────────────────────────

export function useUserWallets(endUserId: string) {
  return useQuery({
    queryKey: [...WALLETS_KEY, endUserId],
    queryFn: () =>
      api.get<{ items: WalletView[] }>(
        `/api/v1/currency/wallets?endUserId=${encodeURIComponent(endUserId)}`,
      ),
    select: (data) => data.items,
    enabled: !!endUserId,
  })
}

export function useUserBalance(endUserId: string, currencyId: string) {
  return useQuery({
    queryKey: [...WALLETS_KEY, endUserId, currencyId],
    queryFn: () =>
      api.get<CurrencyBalance>(
        `/api/v1/currency/wallets/${encodeURIComponent(endUserId)}/${currencyId}`,
      ),
    enabled: !!endUserId && !!currencyId,
  })
}

// ─── Grant / Deduct ──────────────────────────────────────────────

export function useGrantCurrency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: GrantCurrencyInput) =>
      api.post<GrantCurrencyResult>("/api/v1/currency/wallets/grant", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WALLETS_KEY })
      qc.invalidateQueries({ queryKey: LEDGER_KEY })
    },
  })
}

export function useDeductCurrency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: DeductCurrencyInput) =>
      api.post<DeductCurrencyResult>("/api/v1/currency/wallets/deduct", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WALLETS_KEY })
      qc.invalidateQueries({ queryKey: LEDGER_KEY })
    },
  })
}

// ─── Ledger ──────────────────────────────────────────────────────

export function useCurrencyLedger(filter: LedgerQuery = {}) {
  const params = new URLSearchParams()
  if (filter.endUserId) params.set("endUserId", filter.endUserId)
  if (filter.currencyId) params.set("currencyId", filter.currencyId)
  if (filter.source) params.set("source", filter.source)
  if (filter.sourceId) params.set("sourceId", filter.sourceId)
  if (filter.limit) params.set("limit", String(filter.limit))
  if (filter.cursor) params.set("cursor", filter.cursor)
  const qs = params.toString() ? `?${params.toString()}` : ""
  return useQuery({
    queryKey: [...LEDGER_KEY, qs],
    queryFn: () => api.get<LedgerPage>(`/api/v1/currency/ledger${qs}`),
  })
}
