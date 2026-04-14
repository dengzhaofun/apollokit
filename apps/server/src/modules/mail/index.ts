/**
 * Mail module barrel.
 *
 * The mail service depends on the item service for reward grants. This
 * cross-module dependency is injected here at the glue point.
 */

import { deps } from "../../deps";
import { itemService } from "../item";
import { createMailService } from "./service";

export { createMailService };
export type { MailService } from "./service";
export const mailService = createMailService(deps, itemService);
export { mailRouter } from "./routes";
export { mailClientRouter } from "./client-routes";
