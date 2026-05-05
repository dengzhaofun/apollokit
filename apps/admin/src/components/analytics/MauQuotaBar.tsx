/**
 * 当月 MAU + 配额进度条 —— Hub / overview / users 页共用组件。
 *
 * 颜色阈值跟后端 ALERT_THRESHOLDS（80/100/150%）对齐，让运营在
 * 任何看板里看到的"红黄绿"判断都跟邮件告警里一致。
 */

import * as m from "#/paraglide/messages.js"

export interface MauQuotaBarProps {
  yearMonth: string
  mau: number
  quota: number | null
  planName?: string | null
  /** 0-1 之间，传入则覆盖 mau/quota 计算的进度。 */
  overridePct?: number
}

export function MauQuotaBar({
  yearMonth,
  mau,
  quota,
  planName,
  overridePct,
}: MauQuotaBarProps) {
  const pct = overridePct ?? (quota ? mau / quota : 0)
  const pctClamped = Math.min(1, Math.max(0, pct))
  const fillColor =
    pct >= 1 ? "bg-destructive" : pct >= 0.8 ? "bg-amber-500" : "bg-primary"

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">
            {m.mau_quota_bar_label({ yearMonth })}
          </div>
          <div className="mt-1 text-2xl font-semibold">
            {mau.toLocaleString()}
            {quota != null && (
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {quota.toLocaleString()}
              </span>
            )}
          </div>
        </div>
        {planName && (
          <div className="text-xs text-muted-foreground">
            {m.mau_quota_bar_plan({ name: planName })}
          </div>
        )}
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${fillColor} transition-all`}
          style={{ width: `${(pctClamped * 100).toFixed(2)}%` }}
        />
      </div>
      {quota != null && (
        <div className="mt-2 text-xs text-muted-foreground">
          {`${(pct * 100).toFixed(1)}%`}
          {pct >= 1 && ` · ${m.mau_quota_bar_over_quota()}`}
        </div>
      )}
      {quota == null && (
        <div className="mt-2 text-xs text-muted-foreground">
          {m.mau_quota_bar_no_plan()}
        </div>
      )}
    </div>
  )
}
