import { z } from "zod"

/**
 * Standard search-params shape for URL-driven modal/drawer state.
 *
 * Routes that host a Dialog or Drawer for create/edit should merge this into
 * their `validateSearch`. The shape is intentionally minimal:
 *
 *   ?modal=create
 *   ?modal=edit&id=<resourceId>
 *
 * `passthrough()` preserves any other search keys the route owns (filters,
 * pagination, etc.), so adding modal state never breaks existing search params.
 */
export const modalSearchSchema = z
  .object({
    modal: z.enum(["create", "edit"]).optional(),
    /** Resource id for `modal=edit`. */
    id: z.string().optional(),
    /**
     * Sub-resource discriminator for parent detail pages that host modals
     * for multiple child resource types (e.g. Pool detail page hosting
     * tier / prize / pity drawers). Top-level routes leave this empty.
     */
    kind: z.string().optional(),
  })
  .passthrough()

export type ModalSearch = z.infer<typeof modalSearchSchema>

type ModalKeys = Pick<ModalSearch, "modal" | "id" | "kind">

/** Empty modal state — pass to `navigate({ search })` to close any open modal. */
export const closedModal: ModalKeys = {
  modal: undefined,
  id: undefined,
  kind: undefined,
}

/** Builders for the common transitions, to avoid stringly-typed call sites. */
export const openCreateModal: ModalKeys = {
  modal: "create",
  id: undefined,
  kind: undefined,
}

export function openEditModal(id: string): ModalKeys {
  return { modal: "edit", id, kind: undefined }
}

/** Open a sub-resource create modal, e.g. `kind="tier"` under a pool detail. */
export function openCreateChildModal(kind: string): ModalKeys {
  return { modal: "create", id: undefined, kind }
}

/** Open a sub-resource edit modal, e.g. `kind="tier"` + `id` under a pool detail. */
export function openEditChildModal(kind: string, id: string): ModalKeys {
  return { modal: "edit", id, kind }
}
