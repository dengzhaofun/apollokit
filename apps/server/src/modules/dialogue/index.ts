/**
 * Dialogue module barrel.
 *
 * The dialogue service depends on the item service for reward grants.
 * Mirrors the mail module wiring.
 */

import { deps } from "../../deps";
import { itemService } from "../item";
import { createDialogueService } from "./service";

export { createDialogueService };
export type { DialogueService } from "./service";
export const dialogueService = createDialogueService(deps, itemService);
export { dialogueRouter } from "./routes";
export { dialogueClientRouter } from "./client-routes";
