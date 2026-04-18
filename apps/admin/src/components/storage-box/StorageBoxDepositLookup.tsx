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
import { useCurrencies } from "#/hooks/use-currency"
import {
  useStorageBoxConfigs,
  useUserDeposits,
  useWithdraw,
} from "#/hooks/use-storage-box"
import type { StorageBoxDepositView } from "#/lib/types/storage-box"

export function StorageBoxDepositLookup() {
  const [input, setInput] = useState("")
  const [endUserId, setEndUserId] = useState("")
  const { data: deposits, isPending, error } = useUserDeposits(endUserId)
  const { data: configs } = useStorageBoxConfigs()
  const { data: defs } = useCurrencies()
  const withdraw = useWithdraw()

  const configById = new Map((configs ?? []).map((c) => [c.id, c]))
  const defById = new Map((defs ?? []).map((d) => [d.id, d]))

  function handleWithdraw(d: StorageBoxDepositView) {
    const cfg = configById.get(d.boxConfigId)
    if (!cfg) return
    const isFixed = cfg.type === "fixed"
    if (isFixed && !d.isMatured && !cfg.allowEarlyWithdraw) {
      window.alert("定期未到期且配置不允许提前取款")
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
            err instanceof Error ? err.message : "取款失败",
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
            placeholder="例如：user-42"
          />
        </div>
        <Button type="submit">查询</Button>
      </form>

      {endUserId ? (
        isPending ? (
          <div className="text-sm text-muted-foreground">加载中...</div>
        ) : error ? (
          <div className="text-sm text-destructive">
            加载失败：{error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>存储箱</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>货币</TableHead>
                  <TableHead>本金</TableHead>
                  <TableHead>利息（投射）</TableHead>
                  <TableHead>到期</TableHead>
                  <TableHead>存入时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(deposits ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      该用户没有活跃存款。
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
                            <Badge variant="default">定期</Badge>
                          ) : (
                            <Badge variant="secondary">活期</Badge>
                          )}
                        </TableCell>
                        <TableCell>{def?.name ?? "—"}</TableCell>
                        <TableCell>{d.principal}</TableCell>
                        <TableCell>{d.projectedInterest}</TableCell>
                        <TableCell>
                          {d.maturesAt ? (
                            <span>
                              {format(new Date(d.maturesAt), "yyyy-MM-dd HH:mm")}
                              {d.isMatured && (
                                <Badge variant="default" className="ml-2">
                                  已到期
                                </Badge>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
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
                            取款
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
          输入 endUserId 查询其全部存款。
        </p>
      )}
    </div>
  )
}
