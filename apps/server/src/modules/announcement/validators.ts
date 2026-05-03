import { z } from "@hono/zod-openapi";

import { defineListFilter, f } from "../../lib/list-filter";
import { pageOf } from "../../lib/pagination";
import { announcements } from "../../schema/announcement";
import {
  ANNOUNCEMENT_KINDS,
  ANNOUNCEMENT_SEVERITIES,
} from "./types";

const AliasSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9-_]*$/, {
    message: "alias must be lowercase alphanumeric plus '-' or '_'",
  });

const KindSchema = z.enum(ANNOUNCEMENT_KINDS).openapi({
  description:
    "'modal' = one-shot popup on app start; 'feed' = persistent list item; " +
    "'ticker' = scrolling short-text banner. Clients decide how to render.",
});

const SeveritySchema = z.enum(ANNOUNCEMENT_SEVERITIES).openapi({
  description: "Visual tone hint for the client — info / warning / urgent.",
});

// ─── Create / update ────────────────────────────────────────────

export const CreateAnnouncementSchema = z
  .object({
    alias: AliasSchema.openapi({
      description:
        "Project-scoped stable slug. Must be unique within the project.",
      example: "maintenance-2026-04-19",
    }),
    kind: KindSchema,
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(20_000).openapi({
      description: "Markdown. Rendered by the client.",
    }),
    coverImageUrl: z.string().url().max(2048).nullable().optional(),
    ctaUrl: z.string().url().max(2048).nullable().optional(),
    ctaLabel: z.string().min(1).max(80).nullable().optional(),
    priority: z.number().int().min(-1000).max(1000).optional(),
    severity: SeveritySchema.optional(),
    isActive: z.boolean().optional(),
    visibleFrom: z.string().datetime().nullable().optional(),
    visibleUntil: z.string().datetime().nullable().optional(),
  })
  .openapi("AnnouncementCreateRequest");

export const UpdateAnnouncementSchema = CreateAnnouncementSchema.partial()
  .omit({ alias: true })
  .openapi("AnnouncementUpdateRequest");

export type CreateAnnouncementInput = z.input<typeof CreateAnnouncementSchema>;
export type UpdateAnnouncementInput = z.input<typeof UpdateAnnouncementSchema>;

// ─── List query ─────────────────────────────────────────────────

export const announcementFilters = defineListFilter({
  kind: f.enumOf(ANNOUNCEMENT_KINDS, { column: announcements.kind }),
  isActive: f.boolean({ column: announcements.isActive }),
  severity: f.enumOf(ANNOUNCEMENT_SEVERITIES, {
    column: announcements.severity,
  }),
})
  .search({ columns: [announcements.alias, announcements.title] })
  .build();

export const ListAnnouncementsQuerySchema =
  announcementFilters.querySchema.openapi("ListAnnouncementsQuery");

export type ListAnnouncementsQuery = z.input<
  typeof ListAnnouncementsQuerySchema
>;

// ─── Path params ────────────────────────────────────────────────

export const AliasParamSchema = z.object({
  alias: AliasSchema.openapi({
    param: { name: "alias", in: "path" },
  }),
});

// ─── Response shapes ────────────────────────────────────────────

export const AnnouncementResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    alias: z.string(),
    kind: KindSchema,
    title: z.string(),
    body: z.string(),
    coverImageUrl: z.string().nullable(),
    ctaUrl: z.string().nullable(),
    ctaLabel: z.string().nullable(),
    priority: z.number().int(),
    severity: SeveritySchema,
    isActive: z.boolean(),
    visibleFrom: z.string().nullable(),
    visibleUntil: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Announcement");

export const AnnouncementListResponseSchema = pageOf(AnnouncementResponseSchema).openapi(
  "AnnouncementList",
);

export const ClientAnnouncementSchema = z
  .object({
    id: z.string(),
    alias: z.string(),
    kind: KindSchema,
    title: z.string(),
    body: z.string(),
    coverImageUrl: z.string().nullable(),
    ctaUrl: z.string().nullable(),
    ctaLabel: z.string().nullable(),
    priority: z.number().int(),
    severity: SeveritySchema,
    createdAt: z.string(),
  })
  .openapi("ClientAnnouncement");

export const ClientAnnouncementListResponseSchema = z
  .object({ items: z.array(ClientAnnouncementSchema) })
  .openapi("ClientAnnouncementList");

