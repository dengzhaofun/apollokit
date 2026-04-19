import { deps } from "../../deps";
import { createInviteService } from "./service";

export { createInviteService };
export type { InviteService } from "./service";
export const inviteService = createInviteService(deps);
export { inviteRouter } from "./routes";
