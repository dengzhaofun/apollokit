import { useState } from "react"
import { format } from "date-fns"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useAllCurrencies } from "#/hooks/use-currency"
import {
  useAllStorageBoxConfigs,
  useUserDeposits,
  useWithdraw,
} from "#/hooks/use-storage-box"
import type { StorageBoxDepositView } from "#/lib/types/storage-box"
import * as m from "#/paraglide/messages.js"

export function StorageBoxDepositLookup() {
  const [input, setInput] = useState("")
  const [endUserId, setEndUserId] = useState("")
  const { data: deposits, isPending, error } = useUserDeposits(endUserId)
  const { data: configs } = useAllStorageBoxConfigs()
  const { data: defs } = useAllCurrencies()
  const withdraw = useWithdraw()

  const configById = new Map((configs ?? []).map((c) => [c.id, c]))
  const defById = new Map((defs ?? []).map((d) => [d.id, d]))

  function handleWithdraw(d: StorageBoxDepositView) {
    const cfg = configById.get(d.boxConfigId)
    if (!cfg) return
    const isFixed = cfg.type === "fixed"
    if (isFixed && !d.isMatured && !cfg.allowEarlyWithdraw) {
      window.alert(m.storage_box_deposit_early_blocked())
      return
    }
    withdraw.mutate(
      isFixed
        ? { endUserId: d.endUserId, depositId: d.id }
        : {
            endUserId: d.endUserId,
            boxConfigId: d.boxConfigId,
            currencyDefinitionId: d.currencyDefinitionId,
          },
      {
        onError: (err: unknown) => {
          window.alert(
            err instanceof Error
              ? err.message
              : m.storage_box_deposit_withdraw_failed(),
          )
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      <form
        className="flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setEndUserId(input.trim())
        }}
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="endUserId">endUserId</Label>
          <Input
            id="endUserId"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={m.storage_box_deposit_lookup_placeholder()}
          />
        </div>
        <Button type="submit">{m.storage_box_deposit_lookup_search()}</Button>
      </form>

      {endUserId ? (
        isPending ? (
          <div className="text-sm text-muted-foreground">{m.common_loading()}</div>
        ) : error ? (
          <div className="text-sm text-destructive">
            {m.common_failed_to_load({ resource: m.storage_box_page_title(), error: error.message })}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.storage_box_deposit_col_box()}</TableHead>
                  <TableHead>{m.common_type()}</TableHead>
                  <TableHead>{m.storage_box_field_currencies()}</TableHead>
                  <TableHead>{m.storage_box_deposit_col_principal()}</TableHead>
                  <TableHead>{m.storage_box_deposit_col_interest()}</TableHead>
                  <TableHead>{m.storage_box_deposit_col_maturity()}</TableHead>
                  <TableHead>{m.storage_box_deposit_col_deposited_at()}</TableHead>
                  <TableHead>{m.common_actions()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(deposits ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      {m.storage_box_deposit_no_active()}
                    </TableCell>
                  </TableRow>
                ) : (
                  (deposits ?? []).map((d) => {
                    const cfg = configById.get(d.boxConfigId)
                    const def = defById.get(d.currencyDefinitionId)
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">
                          {cfg?.name ?? d.boxConfigId.slice(0, 8)}
                        </TableCell>
                        <TableCell>
                          {cfg?.type === "fixed" ? (
                            <Badge variant="default">{m.storage_box_type_fixed()}</Badge>
                          ) : (
                            <Badge variant="secondary">{m.storage_box_type_demand()}</Badge>
                          )}
                        </TableCell>
                        <TableCell>{def?.name ?? m.common_dash()}</TableCell>
                        <TableCell>{d.principal}</TableCell>
                        <TableCell>{d.projectedInterest}</TableCell>
                        <TableCell>
                          {d.maturesAt ? (
                            <span>
                              {format(new Date(d.maturesAt), "yyyy-MM-dd HH:mm")}
                              {d.isMatured && (
                                <Badge variant="default" className="ml-2">
                                  {m.storage_box_deposit_already_matured()}
                                </Badge>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{m.common_dash()}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(d.depositedAt), "yyyy-MM-dd HH:mm")}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={withdraw.isPending}
                            onClick={() => handleWithdraw(d)}
                          >
                            {m.storage_box_deposit_action_withdraw()}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          {m.storage_box_deposit_lookup_hint()}
        </p>
      )}
    </div>
  )
}
