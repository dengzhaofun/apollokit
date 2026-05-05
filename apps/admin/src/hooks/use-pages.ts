/**
 * Page-projects react-query hooks. Mirrors the admin endpoints under
 * `/api/v1/page/*` (see apps/server/src/modules/page/routes.ts).
 *
 * Pattern matches `use-announcement.ts` / `use-banner.ts` etc — wraps
 * the unified `api` client and invalidates the right query keys on
 * mutations. Templates and form-submissions hooks live here too so
 * the dashboard route can subscribe to all of them with one import.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api } from "#/lib/api-client";
import type {
  CreatePageProjectInput,
  PageConversationMessage,
  PageProject,
  PageProjectVersion,
  PageTemplate,
  PreviewTokenResult,
  UpdatePageProjectInput,
} from "#/lib/types/page";

const PROJECTS_KEY = ["page", "projects"] as const;
const TEMPLATES_KEY = ["page", "templates"] as const;
const VERSIONS_KEY = (projectId: string) =>
  ["page", "project", projectId, "versions"] as const;
const CONVERSATION_KEY = (projectId: string) =>
  ["page", "project", projectId, "conversation"] as const;

// ─── Projects ──────────────────────────────────────────────────────

export function usePageProjects() {
  return useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: () =>
      api.get<{ items: PageProject[]; nextCursor: string | null }>(
        "/api/v1/page",
      ),
  });
}

export function usePageProject(projectId: string | undefined) {
  return useQuery({
    queryKey: [...PROJECTS_KEY, projectId],
    queryFn: () =>
      api.get<PageProject>(
        `/api/v1/page/${encodeURIComponent(projectId as string)}`,
      ),
    enabled: !!projectId,
  });
}

export function useCreatePageProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePageProjectInput) =>
      api.post<PageProject & { initialVersion: PageProjectVersion | null }>(
        "/api/v1/page",
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useUpdatePageProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePageProjectInput) =>
      api.patch<PageProject>(
        `/api/v1/page/${encodeURIComponent(projectId)}`,
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROJECTS_KEY });
      qc.invalidateQueries({ queryKey: [...PROJECTS_KEY, projectId] });
    },
  });
}

export function useDeletePageProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      api.delete(`/api/v1/page/${encodeURIComponent(projectId)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

// ─── Versions ──────────────────────────────────────────────────────

export function usePageProjectVersions(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? VERSIONS_KEY(projectId) : VERSIONS_KEY("__none__"),
    queryFn: () =>
      api.get<{ items: PageProjectVersion[]; nextCursor: string | null }>(
        `/api/v1/page/${encodeURIComponent(projectId as string)}/versions?limit=50`,
      ),
    enabled: !!projectId,
  });
}

export function usePublishVersion(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) =>
      api.post<PageProject>(
        `/api/v1/page/${encodeURIComponent(projectId)}/publish`,
        { versionId },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROJECTS_KEY });
      qc.invalidateQueries({ queryKey: [...PROJECTS_KEY, projectId] });
      qc.invalidateQueries({ queryKey: VERSIONS_KEY(projectId) });
    },
  });
}

export function useRollbackVersion(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { versionId: string; publishImmediately?: boolean }) =>
      api.post<PageProjectVersion & { project: PageProject | null }>(
        `/api/v1/page/${encodeURIComponent(projectId)}/rollback`,
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROJECTS_KEY });
      qc.invalidateQueries({ queryKey: VERSIONS_KEY(projectId) });
    },
  });
}

export function usePreviewToken() {
  return useMutation({
    mutationFn: (input: { projectId: string; versionId: string }) =>
      api.post<PreviewTokenResult>(
        `/api/v1/page/${encodeURIComponent(input.projectId)}/versions/${encodeURIComponent(input.versionId)}/preview-token`,
        {},
      ),
  });
}

// ─── Conversations ─────────────────────────────────────────────────

export function usePageConversation(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId
      ? CONVERSATION_KEY(projectId)
      : CONVERSATION_KEY("__none__"),
    queryFn: () =>
      api.get<{ items: PageConversationMessage[] }>(
        `/api/v1/page/${encodeURIComponent(projectId as string)}/conversations?limit=200`,
      ),
    enabled: !!projectId,
  });
}

// ─── Templates ─────────────────────────────────────────────────────

export function usePageTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: () => api.get<{ items: PageTemplate[] }>("/api/v1/page/templates"),
  });
}
