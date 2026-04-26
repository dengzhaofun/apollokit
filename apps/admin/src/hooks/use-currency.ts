import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
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

/** Paginated currencies list — wired into <DataTable />. */
export function useCurrencies(
  opts: {
    initialPageSize?: number
    activityId?: string | null
    isActive?: boolean
  } = {},
) {
  const { initialPageSize = 50, activityId, isActive } = opts
  return useCursorList<CurrencyDefinition>({
    queryKey: [...DEFINITIONS_KEY, { activityId: activityId ?? null, isActive: isActive ?? null }],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<CurrencyDefinition>>(
        `/api/currency/definitions?${buildQs({
          cursor,
          limit,
          q,
          activityId: activityId === null ? "" : activityId,
          isActive: isActive == null ? undefined : isActive ? "true" : "false",
        })}`,
      ),
    initialPageSize,
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
          `/api/currency/definitions?${buildQs({
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
      api.get<CurrencyDefinition>(`/api/currency/definitions/${key}`),
    enabled: !!key,
  })
}

export function useCreateCurrency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCurrencyInput) =>
      api.post<CurrencyDefinition>("/api/currency/definitions", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY }),
  })
}

export function useUpdateCurrency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCurrencyInput & { id: string }) =>
      api.patch<CurrencyDefinition>(`/api/currency/definitions/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY }),
  })
}

export function useDeleteCurrency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/currency/definitions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY }),
  })
}

// ─── Wallets / balances ──────────────────────────────────────────

export function useUserWallets(endUserId: string) {
  return useQuery({
    queryKey: [...WALLETS_KEY, endUserId],
    queryFn: () =>
      api.get<{ items: WalletView[] }>(
        `/api/currency/wallets?endUserId=${encodeURIComponent(endUserId)}`,
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
        `/api/currency/wallets/${encodeURIComponent(endUserId)}/${currencyId}`,
      ),
    enabled: !!endUserId && !!currencyId,
  })
}

// ─── Grant / Deduct ──────────────────────────────────────────────

export function useGrantCurrency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: GrantCurrencyInput) =>
      api.post<GrantCurrencyResult>("/api/currency/wallets/grant", input),
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
      api.post<DeductCurrencyResult>("/api/currency/wallets/deduct", input),
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
    queryFn: () => api.get<LedgerPage>(`/api/currency/ledger${qs}`),
  })
}
