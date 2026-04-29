/**
 * Patch tool registry — parallel to `apply-registry.ts`.
 *
 * `patch*` tools propose a PARTIAL update to an existing resource that
 * the user @-mentioned. Distinct from `apply*` (which is for new
 * configs in the create form). The frontend renders a different card
 * for patch tools (diff view) and fires `PATCH /api/<module>/.../{key}`
 * with the partial body — no form context needed, so this works on
 * dashboard / list surfaces too.
 *
 * Adding a new module = one import + one entry, mirroring
 * apply-registry's shape.
 */

import { patchActivityConfig } from "./patch/activity";
import { patchAnnouncement } from "./patch/announcement";
import { patchCharacterConfig } from "./patch/character";
import { patchCheckInConfig } from "./patch/check-in";
import { patchDialogueScript } from "./patch/dialogue";
import { patchItemDefinition } from "./patch/item";
import { patchTaskDefinition } from "./patch/task";

/**
 * Module → patch-tool name + tool object. Names are the wire identifiers
 * the model emits as `tool-<name>` UIMessage parts; the frontend matches
 * on these strings to pick the renderer.
 */
export const PATCH_TOOL_BY_MODULE = {
  "activity": { name: "patchActivityConfig", tool: patchActivityConfig },
  "announcement": { name: "patchAnnouncement", tool: patchAnnouncement },
  "character": { name: "patchCharacterConfig", tool: patchCharacterConfig },
  "check-in": { name: "patchCheckInConfig", tool: patchCheckInConfig },
  "dialogue": { name: "patchDialogueScript", tool: patchDialogueScript },
  "item": { name: "patchItemDefinition", tool: patchItemDefinition },
  "task": { name: "patchTaskDefinition", tool: patchTaskDefinition },
} as const;

export type PatchableModule = keyof typeof PATCH_TOOL_BY_MODULE;
