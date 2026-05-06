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
import * as m from "#/paraglide/messages.js"

const KEY = ["audit-logs"] as const

/**
 * 静态过滤定义。`resourceType` 选项在运行时由
 * `useAuditLogResourceTypes()` 动态填充，所以这里默认空 options，
 * 由消费组件 spread 注入。
 */
export const AUDIT_LOG_FILTER_DEFS_BASE: FilterDef[] = [
  {
    id: "actorType",
    label: m.filter_label_actor_type(),
    type: "select",
    options: [
      { value: "user", label: m.filter_opt_user() },
      { value: "admin-api-key", label: m.filter_opt_admin_api_key() },
      { value: "system", label: m.filter_opt_system() },
    ],
  },
  {
    id: "actorId",
    label: m.filter_label_actor_id(),
    type: "select",
    options: [], // free-form text input, no preset values
  },
  {
    id: "resourceType",
    label: m.filter_label_resource_type(),
    type: "select",
    options: [], // populated at runtime
  },
  {
    id: "resourceId",
    label: m.filter_label_resource_id(),
    type: "select",
    options: [],
  },
  {
    id: "action",
    label: m.filter_label_action(),
    type: "select",
    options: [
      { value: "create", label: m.filter_opt_create() },
      { value: "update", label: m.filter_opt_update() },
      { value: "delete", label: m.filter_opt_delete() },
    ],
  },
  {
    id: "method",
    label: m.filter_label_method(),
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
    label: m.filter_label_time(),
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
    searchPlaceholder: m.audit_log_search_placeholder(),
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
