import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { AnyRoute } from "@tanstack/react-router"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  Activity,
  ActivityMemberListItem,
  ActivityMemberStatus,
  ActivityNode,
  ActivitySchedule,
  ActivityTemplate,
  ActivityViewForUser,
  CreateActivityInput,
  CreateActivityTemplateInput,
  CreateNodeInput,
  CreateScheduleInput,
  UpdateActivityInput,
} from "#/lib/types/activity"

const KEY = ["activities"] as const

export const ACTIVITY_FILTER_DEFS: FilterDef[] = [
  {
    id: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "draft", label: "Draft" },
      { value: "scheduled", label: "Scheduled" },
      { value: "teasing", label: "Teasing" },
      { value: "active", label: "Active" },
      { value: "ended", label: "Ended" },
      { value: "archived", label: "Archived" },
    ],
  },
  {
    id: "kind",
    label: "Kind",
    type: "select",
    options: [
      { value: "generic", label: "Generic" },
      { value: "check_in_only", label: "Check-In Only" },
      { value: "board_game", label: "Board Game" },
      { value: "gacha", label: "Gacha" },
      { value: "season_pass", label: "Season Pass" },
      { value: "custom", label: "Custom" },
    ],
  },
]

/** Paginated activities — URL-driven. */
 
export function useActivities(route: AnyRoute) {
  return useListSearch<Activity>({
    route,
    queryKey: KEY,
    filterDefs: ACTIVITY_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<Activity>>(
        `/api/v1/activity?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllActivities() {
  return useQuery({
    queryKey: [...KEY, "all"],
    queryFn: () =>
      api
        .get<Page<Activity>>(`/api/v1/activity?${buildQs({ limit: 200 })}`)
        .then((p) => p.items),
  })
}

export function useActivity(key: string) {
  return useQuery({
    queryKey: [...KEY, key],
    queryFn: () => api.get<Activity>(`/api/v1/activity/${key}`),
    enabled: !!key,
  })
}

export function useCreateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateActivityInput) =>
      api.post<Activity>("/api/v1/activity", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateActivityInput & { id: string }) =>
      api.patch<Activity>(`/api/v1/activity/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/activity/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useActivityLifecycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      key,
      action,
    }: {
      key: string
      action: "publish" | "unpublish" | "archive"
    }) => api.post<Activity>(`/api/v1/activity/${key}/publish`, { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

// ─── Nodes ─────────────────────────────────────────────────────────

export type ActivityPhase =
  | "draft"
  | "scheduled"
  | "teasing"
  | "active"
  | "ended"
  | "archived"

export type ActivityTimeline = {
  state: ActivityPhase
  now: string | Date
  msToVisible: number
  msToStart: number
  msToEnd: number
  msToRewardEnd: number
  msToHidden: number
}

export type ActivityNodeListResponse = {
  items: ActivityNode[]
  activity: {
    id: string
    alias: string
    derivedPhase: ActivityPhase
    timeline: ActivityTimeline
  }
}

export function useActivityNodes(key: string) {
  return useQuery({
    queryKey: ["activity-nodes", key],
    queryFn: () =>
      api.get<ActivityNodeListResponse>(`/api/v1/activity/${key}/nodes`),
    enabled: !!key,
  })
}

export function useCreateActivityNode(activityKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateNodeInput) =>
      api.post<ActivityNode>(`/api/v1/activity/${activityKey}/nodes`, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["activity-nodes", activityKey] }),
  })
}

export function useUpdateActivityNode(activityKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string
      enabled?: boolean
      orderIndex?: number
      nodeConfig?: Record<string, unknown> | null
      refId?: string | null
      unlockRule?: Record<string, unknown> | null
    }) =>
      api.patch<ActivityNode>(`/api/v1/activity/nodes/${id}`, patch),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["activity-nodes", activityKey] }),
  })
}

export function useDeleteActivityNode(activityKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (nodeId: string) =>
      api.delete(`/api/v1/activity/nodes/${nodeId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["activity-nodes", activityKey] }),
  })
}

// ─── Schedules ─────────────────────────────────────────────────────

export function useActivitySchedules(key: string) {
  return useQuery({
    queryKey: ["activity-schedules", key],
    queryFn: () =>
      api.get<{ items: ActivitySchedule[] }>(
        `/api/v1/activity/${key}/schedules`,
      ),
    select: (data) => data.items,
    enabled: !!key,
  })
}

export function useCreateActivitySchedule(activityKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateScheduleInput) =>
      api.post<ActivitySchedule>(
        `/api/v1/activity/${activityKey}/schedules`,
        input,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["activity-schedules", activityKey] }),
  })
}

export function useDeleteActivitySchedule(activityKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/activity/schedules/${id}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["activity-schedules", activityKey] }),
  })
}

// ─── Player view (aggregated) ──────────────────────────────────────

export function useActivityForUser(activityKey: string, endUserId: string) {
  return useQuery({
    queryKey: ["activity-view", activityKey, endUserId],
    queryFn: () =>
      api.get<ActivityViewForUser>(
        `/api/v1/activity/${activityKey}/view/${encodeURIComponent(endUserId)}`,
      ),
    enabled: !!activityKey && !!endUserId,
  })
}

// ─── Templates (recurring activities) ─────────────────────────────

const TEMPLATES_KEY = ["activity-templates"] as const

export function useActivityTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: () =>
      api.get<{ items: ActivityTemplate[] }>("/api/v1/activity/templates"),
    select: (d) => d.items,
  })
}

export function useCreateActivityTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateActivityTemplateInput) =>
      api.post<ActivityTemplate>("/api/v1/activity/templates", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export function useDeleteActivityTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/activity/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export function useInstantiateActivityTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ activityAlias: string; activityId: string }>(
        `/api/v1/activity/templates/${id}/instantiate`,
      ),
    onSuccess: () => qc.invalidateQueries(),
  })
}

// ─── Analytics ─────────────────────────────────────────────────────

export interface ActivityAnalytics {
  participants: number
  completed: number
  dropped: number
  avgPoints: number
  maxPoints: number
  p50Points: number
  pointsBuckets: Array<{ bucket: string; count: number }>
}

export function useActivityAnalytics(key: string) {
  return useQuery({
    queryKey: ["activity-analytics", key],
    queryFn: () =>
      api.get<ActivityAnalytics>(`/api/v1/activity/${key}/analytics`),
    enabled: !!key,
  })
}

// ─── Members (participants list + leave + queue redemption) ────────

type MembersPage = {
  items: ActivityMemberListItem[]
  nextCursor: string | null
}

export function useActivityMembers(
  key: string,
  opts: { status?: ActivityMemberStatus | "all"; cursor?: string; limit?: number } = {},
) {
  const status = opts.status ?? "all"
  const limit = opts.limit ?? 50
  return useQuery({
    queryKey: ["activity-members", key, status, opts.cursor ?? null, limit],
    queryFn: () => {
      const params = new URLSearchParams()
      if (status !== "all") params.set("status", status)
      if (opts.cursor) params.set("cursor", opts.cursor)
      params.set("limit", String(limit))
      const qs = params.toString()
      return api.get<MembersPage>(
        `/api/v1/activity/${key}/members${qs ? `?${qs}` : ""}`,
      )
    },
    enabled: !!key,
  })
}

export function useLeaveActivity(activityKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (endUserId: string) =>
      api.post<unknown>(`/api/v1/activity/${activityKey}/leave`, { endUserId }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["activity-members", activityKey] }),
  })
}

export function useRedeemQueueNumber(activityKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (endUserId: string) =>
      api.post<{ endUserId: string; queueNumber: string; usedAt: string }>(
        `/api/v1/activity/${activityKey}/members/${encodeURIComponent(endUserId)}/redeem-queue`,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["activity-members", activityKey] }),
  })
}

// ─── Ops ───────────────────────────────────────────────────────────

export function useActivityTickRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<{
        advanced: number
        scheduleFired: number
        errors: number
      }>("/api/v1/activity/tick/run"),
    onSuccess: () => qc.invalidateQueries(),
  })
}
