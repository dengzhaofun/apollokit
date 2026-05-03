import { deps } from "../../deps";
import { registerEvent } from "../../lib/event-registry";
import { createInviteService } from "./service";

registerEvent({
  name: "invite.bound",
  owner: "invite",
  description: "邀请关系建立：B 注册并提交 inviter 码。",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true, description: "inviter 的 endUserId（task 进度归属）" },
    { path: "inviterEndUserId", type: "string", required: true },
    { path: "inviteeEndUserId", type: "string", required: true },
    { path: "code", type: "string", required: true, description: "人类可读形式 ABCD-EFGH" },
    { path: "boundAt", type: "string", required: true },
  ],
  forwardToTask: true,
});

registerEvent({
  name: "invite.qualified",
  owner: "invite",
  description: "邀请关系被客户方认定算数：B 达到里程碑 / 付费 / 留存 …",
  fields: [
    { path: "tenantId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true, description: "inviter 的 endUserId（task 进度归属）" },
    { path: "inviterEndUserId", type: "string", required: true },
    { path: "inviteeEndUserId", type: "string", required: true },
    { path: "qualifiedReason", type: "string", required: false, description: "客户方上报的原因（例 first_purchase）" },
    { path: "qualifiedAt", type: "string", required: true },
    { path: "boundAt", type: "string", required: true },
  ],
  forwardToTask: true,
});

export { createInviteService };
export type { InviteService } from "./service";
export const inviteService = createInviteService(deps);
export { inviteRouter } from "./routes";
export { inviteClientRouter } from "./client-routes";
