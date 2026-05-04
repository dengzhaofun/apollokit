/**
 * Audit-log list hook —— 与 server `auditLogFilters`（validators.ts）保持
 * URL key 与 enum 取值对齐。**只读**：没有 mutation hook。
 */
import { useQuery } from "@tanstack/react-query"
import type { AnyRoute } from "@tanstack/react-router"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type { AuditLog } from "#/lib/types/audit-log"

const KEY = ["audit-logs"] as const

/**
 * 静态过滤定义。`resourceType` 选项在运行时由
 * `useAuditLogResourceTypes()` 动态填充，所以这里默认空 options，
 * 由消费组件 spread 注入。
 */
export const AUDIT_LOG_FILTER_DEFS_BASE: FilterDef[] = [
  {
    id: "actorType",
    label: "Actor type",
    type: "select",
    options: [
      { value: "user", label: "User" },
      { value: "admin-api-key", label: "Admin API key" },
      { value: "system", label: "System" },
    ],
  },
  {
    id: "actorId",
    label: "Actor ID",
    type: "select",
    options: [], // free-form text input, no preset values
  },
  {
    id: "resourceType",
    label: "Resource type",
    type: "select",
    options: [], // populated at runtime
  },
  {
    id: "resourceId",
    label: "Resource ID",
    type: "select",
    options: [],
  },
  {
    id: "action",
    label: "Action",
    type: "select",
    options: [
      { value: "create", label: "Create" },
      { value: "update", label: "Update" },
      { value: "delete", label: "Delete" },
    ],
  },
  {
    id: "method",
    label: "Method",
    type: "multiselect",
    options: [
      { value: "POST", label: "POST" },
      { value: "PUT", label: "PUT" },
      { value: "PATCH", label: "PATCH" },
      { value: "DELETE", label: "DELETE" },
    ],
  },
  {
    id: "ts",
    label: "Time",
    type: "dateRange",
  },
]

/**
 * 把 server 返回的 distinct resourceType 列表合并进 base FilterDef。
 * 消费组件用 `useMemo` 拆出来调一次即可。
 */
export function withResourceTypeOptions(
  defs: FilterDef[],
  resourceTypes: string[],
): FilterDef[] {
  return defs.map((d) =>
    d.id === "resourceType" && d.type === "select"
      ? {
          ...d,
          options: resourceTypes.map((rt) => ({ value: rt, label: rt })),
        }
      : d,
  )
}

 
export function useAuditLogs(route: AnyRoute, filterDefs: FilterDef[]) {
  return useListSearch<AuditLog>({
    route,
    queryKey: [...KEY, "list"],
    filterDefs,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<AuditLog>>(
        `/api/v1/audit-logs?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
  })
}

export function useAuditLogResourceTypes() {
  return useQuery({
    queryKey: [...KEY, "resource-types"],
    queryFn: () => api.get<{ items: string[] }>(`/api/v1/audit-logs/resource-types`),
  })
}

export function useAuditLog(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "one", id ?? ""],
    queryFn: () => api.get<AuditLog>(`/api/v1/audit-logs/${encodeURIComponent(id ?? "")}`),
    enabled: !!id,
  })
}
