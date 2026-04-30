/**
 * Patch tool registry — parallel to `apply-registry.ts`.
 *
 * `patch*` tools propose a PARTIAL update to an existing resource that
 * the user @-mentioned. Distinct from `apply*` (which is for new
 * configs in the create form). The frontend renders a different card
 * for patch tools (diff view) and either:
 *   - **form-fill agent** — the model emits the proposal, the FE renders
 *     `PatchConfigCard` and fires `PATCH /api/<module>/.../{key}` after
 *     user confirms (uses the `propose` variant — no `execute`);
 *   - **global-assistant agent** — the model's tool call directly writes
 *     to the module service via `execute` (uses the `execute` variant).
 *
 * Adding a new module = one import of both variants + one entry, mirroring
 * apply-registry's shape.
 */

import {
  patchActivityConfigExecute,
  patchActivityConfigPropose,
} from "./patch/activity";
import {
  patchAnnouncementExecute,
  patchAnnouncementPropose,
} from "./patch/announcement";
import {
  patchCharacterConfigExecute,
  patchCharacterConfigPropose,
} from "./patch/character";
import {
  patchCheckInConfigExecute,
  patchCheckInConfigPropose,
} from "./patch/check-in";
import {
  patchDialogueScriptExecute,
  patchDialogueScriptPropose,
} from "./patch/dialogue";
import {
  patchItemDefinitionExecute,
  patchItemDefinitionPropose,
} from "./patch/item";
import {
  patchTaskDefinitionExecute,
  patchTaskDefinitionPropose,
} from "./patch/task";

/**
 * Module → patch-tool name + propose/execute pair. Both variants share
 * the same wire name so the frontend renders them identically — the only
 * runtime difference is whether the model's call resolves via an internal
 * `execute` (global-assistant) or sits as `input-available` for the FE
 * card to confirm (form-fill).
 */
export const PATCH_TOOL_BY_MODULE = {
  "activity": {
    name: "patchActivityConfig",
    propose: patchActivityConfigPropose,
    execute: patchActivityConfigExecute,
  },
  "announcement": {
    name: "patchAnnouncement",
    propose: patchAnnouncementPropose,
    execute: patchAnnouncementExecute,
  },
  "character": {
    name: "patchCharacterConfig",
    propose: patchCharacterConfigPropose,
    execute: patchCharacterConfigExecute,
  },
  "check-in": {
    name: "patchCheckInConfig",
    propose: patchCheckInConfigPropose,
    execute: patchCheckInConfigExecute,
  },
  "dialogue": {
    name: "patchDialogueScript",
    propose: patchDialogueScriptPropose,
    execute: patchDialogueScriptExecute,
  },
  "item": {
    name: "patchItemDefinition",
    propose: patchItemDefinitionPropose,
    execute: patchItemDefinitionExecute,
  },
  "task": {
    name: "patchTaskDefinition",
    propose: patchTaskDefinitionPropose,
    execute: patchTaskDefinitionExecute,
  },
} as const;

export type PatchableModule = keyof typeof PATCH_TOOL_BY_MODULE;

export type PatchToolVariant = "propose" | "execute";
