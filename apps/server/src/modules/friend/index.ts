import { deps } from "../../deps";
import { createFriendService } from "./service";

export { createFriendService };
export type { FriendService } from "./service";
export const friendService = createFriendService(deps);
export { friendRouter } from "./routes";
export { friendClientRouter } from "./client-routes";
