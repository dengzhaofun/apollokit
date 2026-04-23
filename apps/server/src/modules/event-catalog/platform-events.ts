/**
 * 平台级静态事件声明 —— HTTP 请求日志、会话事件、cron 等,**不走 EventBus**
 * 但进了 Tinybird 的信号。
 *
 * 为什么静态:这些事件不是业务代码 emit 的(它们来自 HTTP middleware、
 * Better Auth hooks、平台 cron 等"内置机制"),所以没必要在 event-registry
 * 里用 `registerEvent()` 注册;也不在 `event_catalog_entries` 表里(那是
 * 租户自己上报的外部事件)。但数据分析入口(漏斗 / 留存 / 自定义看板)
 * 需要能从目录里选到它们,所以独立声明一份。
 *
 * Capability 只有 `"analytics"` —— 这些事件天然不能驱动 task(HTTP 请求
 * 日志、session 事件等都不是"玩家主动的业务行为")。task 的事件选择器
 * `?capability=task-trigger` 会自动过滤掉这里的全部条目。
 *
 * 添加条目:
 *   1. 在下方数组追加一项,填齐 `fields`
 *   2. 如果是 http-request 维度,考虑是否要在 Tinybird pipe 里支持按
 *      `path` 过滤;如果是 platform-event,考虑是否已经有对应的
 *      Better Auth hook / cron handler 真的会让这个事件进 Tinybird
 *
 * 一期只声明 2 条示例,二期按需扩展。
 */

import type { EventFieldSchema } from "../../lib/event-registry";
import type {
  EventCapability,
  EventKind,
} from "../../lib/event-capability";

export type PlatformEventDescriptor = {
  name: string;
  kind: Extract<EventKind, "http-request" | "platform-event">;
  owner: string;
  description: string;
  fields: EventFieldSchema[];
  capabilities: EventCapability[];
};

export const PLATFORM_EVENTS: PlatformEventDescriptor[] = [
  {
    name: "http.request",
    kind: "http-request",
    owner: "platform",
    description:
      "任何一次 API 请求的日志条目。数据源:Tinybird `http_requests` datasource。",
    capabilities: ["analytics"],
    fields: [
      { path: "trace_id", type: "string", required: true },
      { path: "path", type: "string", required: true },
      { path: "method", type: "string", required: true },
      { path: "status", type: "number", required: true },
      { path: "duration_ms", type: "number", required: true },
      {
        path: "actor",
        type: "string",
        required: true,
        description: "admin / api-key / end-user / anonymous",
      },
      { path: "org_id", type: "string", required: true },
      { path: "end_user_id", type: "string", required: false },
    ],
  },
  {
    name: "user.signed_in",
    kind: "platform-event",
    owner: "platform",
    description:
      "玩家通过 Better Auth 完成登录。来源:eu_session.createdAt;不经过 EventBus。",
    capabilities: ["analytics"],
    fields: [
      { path: "org_id", type: "string", required: true },
      { path: "end_user_id", type: "string", required: true },
      { path: "provider", type: "string", required: false },
      {
        path: "source",
        type: "string",
        required: false,
        description: "'platform' = 平台自注册;'external' = 游戏方同步",
      },
    ],
  },
];
