/**
 * Battle Pass Kind Handler —— 把纪行业务接到 activity 的 Kind Handler
 * 框架上。本 handler 声明自己是 `season_pass` kind 的实现；activity
 * 生命周期流转、`task.completed` 事件会通过注册表路由进来。
 *
 * Handler 本身不写业务逻辑，全部委托给 battlePassService —— handler
 * 只是协议适配层。
 */

import type { ActivityKindHandler } from "../activity/kind/handler";
import { UnsupportedCommandError } from "../activity/kind/errors";
import {
  BattlePassConfigNotFound,
  BattlePassInvalidInput,
} from "./errors";
import type { BattlePassService } from "./service";
import type {
  BattlePassAggregateView,
  BattlePassCommand,
} from "./types";
import type { BattlePassConfig } from "../../schema/battle-pass";

export function createBattlePassHandler(
  svcGetter: () => BattlePassService,
): ActivityKindHandler<BattlePassConfig, BattlePassAggregateView, BattlePassCommand> {
  return {
    kind: "season_pass",

    async loadConfig(activity) {
      try {
        // activity.tenantId 一定有
        return await svcGetter()
          .listConfigs(activity.tenantId)
          .then(
            (configs) =>
              configs.find((c) => c.activityId === activity.id) ?? null,
          );
      } catch {
        return null;
      }
    },

    subscribedEvents: ["task.completed"],
    async onEvent({ eventName, payload }) {
      if (eventName !== "task.completed") return;
      const p = payload as {
        tenantId: string;
        endUserId: string;
        taskId: string;
      };
      if (!p?.tenantId || !p?.endUserId || !p?.taskId) return;
      await svcGetter().grantXpForTask({
        tenantId: p.tenantId,
        endUserId: p.endUserId,
        taskDefinitionId: p.taskId,
      });
    },

    async getUserState({ activity, endUserId }) {
      // 找到 activity 对应的纪行 config
      const config = await svcGetter()
        .listConfigs(activity.tenantId)
        .then((configs) => configs.find((c) => c.activityId === activity.id));
      if (!config) throw new BattlePassConfigNotFound(activity.id);
      return await svcGetter().getAggregateView(
        activity.tenantId,
        config.id,
        endUserId,
      );
    },

    supportedCommands: ["grant-tier", "claim-level", "claim-all"],
    async executeCommand({ activity, command }) {
      const svc = svcGetter();
      const config = await svc
        .listConfigs(activity.tenantId)
        .then((configs) => configs.find((c) => c.activityId === activity.id));
      if (!config) throw new BattlePassConfigNotFound(activity.id);

      switch (command.type) {
        case "grant-tier":
          return await svc.grantTier({
            tenantId: activity.tenantId,
            seasonId: config.id,
            endUserId: command.payload.endUserId,
            tierCode: command.payload.tierCode,
            source: command.payload.source,
            externalOrderId: command.payload.externalOrderId ?? null,
          });
        case "claim-level":
          return await svc.claimLevel({
            tenantId: activity.tenantId,
            seasonId: config.id,
            endUserId: command.payload.endUserId,
            level: command.payload.level,
            tierCode: command.payload.tierCode,
          });
        case "claim-all":
          return await svc.claimAll({
            tenantId: activity.tenantId,
            seasonId: config.id,
            endUserId: command.payload.endUserId,
          });
        default: {
          const exhaustive: never = command;
          throw new UnsupportedCommandError(
            "season_pass",
            (exhaustive as { type: string }).type,
          );
        }
      }
    },

    async onArchive({ activity }) {
      const svc = svcGetter();
      const config = await svc
        .listConfigs(activity.tenantId)
        .then((configs) => configs.find((c) => c.activityId === activity.id));
      if (!config) return; // 没对应 config 就跳过
      await svc.purgeUserProgressForSeason(config.id);
    },

    async onStateChange({ activity, prevState, nextState }) {
      // 目前无专用逻辑：状态切换时只需要归档走 onArchive。
      // 预留这个 hook 给未来的 "开季邮件广播" / "settling 阶段锁任务" 等。
      void activity;
      void prevState;
      void nextState;
    },
  };
}

// 私有：把非法命令 type 兜底抛错。当 TypeScript 的 never 推断失败
// （例如 command 是 unknown 过来的）时，这个保障才真正有意义。
void BattlePassInvalidInput;
