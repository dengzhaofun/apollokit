/**
 * Aggregate of module-service singletons that admin-agent tools call from
 * inside their `execute` functions.
 *
 * **Why this lives here, not in `AppDeps`:**
 *   - `AppDeps` carries cross-cutting infrastructure (db, redis, events,
 *     ai provider). Module services are a different category — they're
 *     the consumers of `AppDeps`, not peers of it. Bundling them in
 *     would create import cycles (`deps.ts` → `modules/check-in/index.ts`
 *     → `deps.ts`).
 *   - The mention pipeline already imports module-service singletons
 *     directly (`mentions/check-in.ts:1`). admin-agent owning a thin
 *     "exec deps" object follows the same pattern.
 *
 * Adding a module to global-assistant's writable surface = one entry here
 * + one `execute` variant in `tools/patch/<module>.ts`.
 */

import { activityService } from "../../activity";
import { announcementService } from "../../announcement";
import { characterService } from "../../character";
import { checkInService } from "../../check-in";
import { dialogueService } from "../../dialogue";
import { itemService } from "../../item";
import { taskService } from "../../task";

export type AgentExecDeps = {
  activity: typeof activityService;
  announcement: typeof announcementService;
  character: typeof characterService;
  checkIn: typeof checkInService;
  dialogue: typeof dialogueService;
  item: typeof itemService;
  task: typeof taskService;
};

export const agentExecDeps: AgentExecDeps = {
  activity: activityService,
  announcement: announcementService,
  character: characterService,
  checkIn: checkInService,
  dialogue: dialogueService,
  item: itemService,
  task: taskService,
};
