import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

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
      { value: "settling", label: "Settling" },
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useActivities(route: any) {
  return useListSearch<Activity>({
    route,
    queryKey: KEY,
    filterDefs: ACTIVITY_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<Activity>>(
        `/api/activity?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllActivities() {
  return useQuery({
    queryKey: [...KEY, "all"],
    queryFn: () =>
      api
        .get<Page<Activity>>(`/api/activity?${buildQs({ limit: 200 })}`)
        .then((p) => p.items),
  })
}

export function useActivity(key: string) {
  return useQuery({
    queryKey: [...KEY, key],
    queryFn: () => api.get<Activity>(`/api/activity/${key}`),
    enabled: !!key,
  })
}

export function useCreateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateActivityInput) =>
      api.post<Activity>("/api/activity", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateActivityInput & { id: string }) =>
      api.patch<Activity>(`/api/activity/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/activity/${id}`),
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
    }) => api.post<Activity>(`/api/activity/${key}/publish`, { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

// ─── Nodes ─────────────────────────────────────────────────────────

export type ActivityPhase =
  | "draft"
  | "scheduled"
  | "teasing"
  | "active"
  | "settling"
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
      api.get<ActivityNodeListResponse>(`/api/activity/${key}/nodes`),
    enabled: !!key,
  })
}

export function useCreateActivityNode(activityKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateNodeInput) =>
      api.post<ActivityNode>(`/api/activity/${activityKey}/nodes`, input),
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
      api.patch<ActivityNode>(`/api/activity/nodes/${id}`, patch),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["activity-nodes", activityKey] }),
  })
}

export function useDeleteActivityNode(activityKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (nodeId: string) =>
      api.delete(`/api/activity/nodes/${nodeId}`),
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
        `/api/activity/${key}/schedules`,
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
        `/api/activity/${activityKey}/schedules`,
        input,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["activity-schedules", activityKey] }),
  })
}

export function useDeleteActivitySchedule(activityKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/activity/schedules/${id}`),
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
        `/api/activity/${activityKey}/view/${encodeURIComponent(endUserId)}`,
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
      api.get<{ items: ActivityTemplate[] }>("/api/activity/templates"),
    select: (d) => d.items,
  })
}

export function useCreateActivityTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateActivityTemplateInput) =>
      api.post<ActivityTemplate>("/api/activity/templates", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export function useDeleteActivityTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/activity/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export function useInstantiateActivityTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ activityAlias: string; activityId: string }>(
        `/api/activity/templates/${id}/instantiate`,
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
  milestoneClaims: Array<{ milestoneAlias: string; count: number }>
  pointsBuckets: Array<{ bucket: string; count: number }>
}

export function useActivityAnalytics(key: string) {
  return useQuery({
    queryKey: ["activity-analytics", key],
    queryFn: () =>
      api.get<ActivityAnalytics>(`/api/activity/${key}/analytics`),
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
        `/api/activity/${key}/members${qs ? `?${qs}` : ""}`,
      )
    },
    enabled: !!key,
  })
}

export function useLeaveActivity(activityKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (endUserId: string) =>
      api.post<unknown>(`/api/activity/${activityKey}/leave`, { endUserId }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["activity-members", activityKey] }),
  })
}

export function useRedeemQueueNumber(activityKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (endUserId: string) =>
      api.post<{ endUserId: string; queueNumber: string; usedAt: string }>(
        `/api/activity/${activityKey}/members/${encodeURIComponent(endUserId)}/redeem-queue`,
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
      }>("/api/activity/tick/run"),
    onSuccess: () => qc.invalidateQueries(),
  })
}
