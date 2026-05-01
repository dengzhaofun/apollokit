/**
 * Activity Kind Handler — 平台内部的活动派生玩法扩展点。
 *
 * 不同 kind 的活动（纪行 = season_pass、签到专项 = check_in_only、抽卡池
 * = gacha …）实现此接口，完成各自独有的聚合业务逻辑。通用子系统
 * （task / leaderboard / currency 等）仍由各自的模块直接暴露 API，
 * Kind Handler **不代理通用子系统**。
 *
 * 职责边界（刻意收窄，避免过度抽象）：
 *   ① 加载 / 校验本 kind 的配置（专属 FK 表或 activity.metadata.kind jsonb）
 *   ② 生命周期 hook：活动在状态机流转时本 kind 要做的事
 *   ③ Kind 特有命令（纪行的 grant-tier / claim-level 等）
 *   ④ Kind 聚合视图（组装跨子系统的玩家视图）
 *   ⑤ 事件订阅（声明式监听 eventBus 事件，如纪行订阅 task.completed 换经验）
 *
 * 契约刻意不规定：
 *   ✗ 通用 `listClaimable / claim` —— 不同 kind 领奖机制不同，各 kind
 *     走自己的命令或业务语义糖路由（`/api/battle-pass/:id/claim-all`）。
 *   ✗ 统一 `/api/activity/:id/*` dispatcher 路由 —— 暂不过度抽象，等
 *     出现第二种 kind 且有共同访问模式时再抽。
 *
 * **面向平台内部工程师，不对 SaaS 客户开放**。客户要自定义玩法走
 * "配置层组合现有子系统" 或 "Webhook 回调"。
 */

import type { AppDeps } from "../../../deps";
import type { EventBus } from "../../../lib/event-bus";
import type { ActivityConfig } from "../../../schema/activity";
import type { ActivityKind, ActivityState } from "../types";

/** 每次 handler 方法调用都能拿到的运行时依赖。 */
export interface KindRuntimeContext {
  db: AppDeps["db"];
  events: EventBus;
}

export interface KindLifecycleParams {
  activity: ActivityConfig;
  prevState: ActivityState;
  nextState: ActivityState;
  runtime: KindRuntimeContext;
}

export interface KindArchiveParams {
  activity: ActivityConfig;
  runtime: KindRuntimeContext;
}

export interface KindUserParams {
  activity: ActivityConfig;
  endUserId: string;
  runtime: KindRuntimeContext;
}

export interface KindCommandParams<TCommand = unknown> {
  activity: ActivityConfig;
  command: TCommand;
  runtime: KindRuntimeContext;
}

/**
 * 事件处理上下文 —— 故意不 pre-resolve activity。Handler 拿到事件
 * 后自己决定这个事件和哪些（可能多个）活动相关。例如纪行 handler
 * 收到 `task.completed` 事件要查"当前 active 的纪行季里有没有绑定
 * 这个 taskDefinitionId"，可能匹配 0、1 或多个季。
 */
export interface KindEventParams {
  eventName: string;
  payload: unknown;
  runtime: KindRuntimeContext;
}

/**
 * Kind Handler 接口。所有方法（除 kind / loadConfig）都是可选 ——
 * Handler 只实现自己需要的。签到 kind 可能只有 executeCommand 和
 * getUserState；纪行 kind 会把大部分都实现。
 */
export interface ActivityKindHandler<
  TConfig = unknown,
  TUserState = unknown,
  TCommand = unknown,
> {
  readonly kind: ActivityKind;

  /**
   * 从 activity 行加载本 kind 的完整配置。通常从专属 FK 表里查
   * （如 `battle_pass_configs`），或从 `activity.metadata.kind` jsonb
   * 里解析。配置不存在返回 null。
   */
  loadConfig(
    activity: ActivityConfig,
    runtime: KindRuntimeContext,
  ): Promise<TConfig | null>;

  /** 活动状态机流转时调用（visibleAt→start→end→rewardEnd→hidden）。 */
  onStateChange?(params: KindLifecycleParams): Promise<void>;

  /** 活动归档清理 —— 清本 kind 的 user_progress 等一次性数据。 */
  onArchive?(params: KindArchiveParams): Promise<void>;

  /** Kind 聚合视图查询（玩家端打开活动页看到的是这个）。 */
  getUserState?(params: KindUserParams): Promise<TUserState>;

  /** Kind 支持的命令字面量列表（仅作声明，真正 dispatch 在 executeCommand 里）。 */
  readonly supportedCommands?: readonly string[];

  /** 执行 Kind 特有命令（如纪行的 grant-tier / claim-level）。 */
  executeCommand?(params: KindCommandParams<TCommand>): Promise<unknown>;

  /** 声明式订阅 eventBus 事件。 */
  readonly subscribedEvents?: readonly string[];

  /** 事件回调。Handler 需自己判断 payload 结构（事件本身是弱类型）。 */
  onEvent?(params: KindEventParams): Promise<void>;
}
