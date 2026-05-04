import { useEffect, useState } from "react"

const STORAGE_KEY = "apollokit:recent-routes"
const MAX_RECENT = 8

export type RecentRoute = {
  path: string
  title: string
  ts: number
}

function read(): RecentRoute[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as RecentRoute[]
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (r) =>
        r &&
        typeof r.path === "string" &&
        typeof r.title === "string" &&
        typeof r.ts === "number",
    )
  } catch {
    return []
  }
}

function write(rows: RecentRoute[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX_RECENT)))
  } catch {
    /* quota exceeded — ignore */
  }
}

/**
 * 最近访问路由历史 — localStorage 持久化,Cmd+K 与 sidebar 共享。
 *
 * 写入路径:CommandPalette / NavLink onClick 触发 push;读取由
 * useRecentRoutes 拉出最近 N 条按时间倒序。
 *
 * 设计选择:不接 router 的 history listener — 直接订阅会把所有
 * 内部跳转(包括重定向、loader 中转)都计入,Cmd+K 列表会显得很乱。
 * 由消费方在合适时机显式 push(用户主动操作时才记)。
 */
export function pushRecentRoute(path: string, title: string) {
  const rows = read()
  const filtered = rows.filter((r) => r.path !== path)
  filtered.unshift({ path, title, ts: Date.now() })
  write(filtered)
  // 通知 useRecentRoutes 刷新(同 tab 内 storage event 不触发,自定义事件兜底)
  window.dispatchEvent(new CustomEvent("apollokit:recent-routes-updated"))
}

export function useRecentRoutes(): RecentRoute[] {
  const [rows, setRows] = useState<RecentRoute[]>(() => read())
  useEffect(() => {
    const onUpdate = () => setRows(read())
    window.addEventListener("apollokit:recent-routes-updated", onUpdate)
    window.addEventListener("storage", onUpdate)
    return () => {
      window.removeEventListener("apollokit:recent-routes-updated", onUpdate)
      window.removeEventListener("storage", onUpdate)
    }
  }, [])
  return rows
}
