/**
 * Event capability —— 元数据维度,不是"事件类型"。
 *
 * 每条事件(不管来自内部 registry、外部上报、HTTP 请求日志、平台级事件)
 * 都带一个 `capabilities` 集合,告诉消费方"这事件可以用在哪些场景":
 *
 *   - "task-trigger": 能被 EventBus 路由到 `taskService.processEvent`。
 *                     任务触发必须选这个 capability 的事件,否则静默失败。
 *   - "analytics"   : 能被数据分析消费(进了 Tinybird / 行为日志)。
 *                     所有业务事件都应该有这个能力。
 *
 * 其他分析视角(漏斗 / 留存 / 用户路径)不是 capability ——
 * 它们是"事件字段是否包含 end_user_id + timestamp"的**字段约束**,
 * 前端构造器看 `fields` 自己判断。在元数据层面再多分类只会增加维护负担。
 *
 * 规划文档:`~/.claude/plans/game-saas-jaunty-dahl.md` 的
 *           "自定义漏斗 & 事件管理和数据分析的关系"章节。
 */

export const EVENT_CAPABILITIES = ["task-trigger", "analytics"] as const;

export type EventCapability = (typeof EVENT_CAPABILITIES)[number];

/**
 * 事件来源类型。和 capability 正交 —— kind 描述**数据从哪来**,
 * capability 描述**可以怎么用**。
 *
 *   - "internal-event"  : EventBus registry 里代码显式注册的业务事件
 *   - "external-event"  : 租户后端上报的自定义事件(DB 表 event_catalog_entries)
 *   - "http-request"    : API 请求日志(Tinybird `http_requests` datasource)
 *   - "platform-event"  : 登录 / 登出 / cron 触发 等平台级信号
 */
export const EVENT_KINDS = [
  "internal-event",
  "external-event",
  "http-request",
  "platform-event",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];
