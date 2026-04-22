/**
 * Activity Kind Handler 注册表。
 *
 * 进程内单例（per-isolate）。各派生玩法模块的 barrel （index.ts）
 * 在 import 时调用 `kindRegistry.register(handler)` 完成注册，
 * activity 模块的生命周期分发和 eventBus 桥接都依赖此表。
 *
 * 重复注册不抛错（HMR、测试重复 import 会触发），直接以最新覆盖。
 * 生产 Workers isolate 每个生命周期只 import 一次，不会出现竞争。
 */

import type { ActivityKindHandler } from "./handler";

class KindRegistry {
  private handlers = new Map<string, ActivityKindHandler>();

  register(handler: ActivityKindHandler): void {
    this.handlers.set(handler.kind, handler);
  }

  resolve(kind: string): ActivityKindHandler | undefined {
    return this.handlers.get(kind);
  }

  list(): ActivityKindHandler[] {
    return Array.from(this.handlers.values());
  }

  /** 仅供测试使用。 */
  __clearForTests(): void {
    this.handlers.clear();
  }
}

export const kindRegistry = new KindRegistry();
export type { KindRegistry };
