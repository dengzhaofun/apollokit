/**
 * Trigger 规则节流。
 *
 * 用 Upstash Redis 的原子 INCR + TTL，每个 (rule, scope, window) 一个 key。
 * 节流命中 fail-closed（拒绝执行），但 Redis 自身故障 fail-open（执行规则
 * + 记 warn 日志）—— 节流是限流不是安全门，丢一次 Redis 不应阻塞业务。
 *
 * Key 形态：
 *   trigger:thr:{ruleId}:{scope}:{windowKey}
 *
 * 其中 scope = "user:{endUserId}" | "org:{orgId}",windowKey 是当前
 * 时间窗的 epoch bucket（minute/hour/day），让滑窗效果近似 fixed window。
 */

import type { Redis } from "@upstash/redis/cloudflare";

import { logger } from "../../lib/logger";

import type { TriggerThrottle } from "./types";

type ThrottleDeps = {
  redis: Redis;
};

export type ThrottleInput = {
  ruleId: string;
  orgId: string;
  endUserId?: string;
  throttle: TriggerThrottle | null;
  /** 当前时间，便于注入测试时钟。 */
  now?: Date;
};

export type ThrottleResult = {
  /** true = 允许执行；false = 命中节流 */
  allowed: boolean;
  /** 哪个限制击中了（当 !allowed 时给出，便于审计） */
  limitedBy?: keyof TriggerThrottle;
};

export function createThrottler(d: ThrottleDeps) {
  return {
    async check(input: ThrottleInput): Promise<ThrottleResult> {
      const { ruleId, orgId, endUserId, throttle } = input;
      if (!throttle) return { allowed: true };

      const now = input.now ?? new Date();
      const checks = buildChecks(throttle, now, endUserId);
      if (checks.length === 0) return { allowed: true };

      try {
        for (const c of checks) {
          const key = `trigger:thr:${ruleId}:${c.scope}:${orgId}:${c.windowKey}`;
          const count = await d.redis.incr(key);
          if (count === 1) {
            // 第一次设置过期，避免无限累计内存。
            await d.redis.expire(key, c.ttlSeconds);
          }
          if (count > c.limit) {
            return { allowed: false, limitedBy: c.field };
          }
        }
        return { allowed: true };
      } catch (err) {
        // Redis 故障 fail-open —— 节流是优化不是安全门
        logger.warn(
          `[trigger-throttle] redis check failed for rule=${ruleId}, fail-open`,
          err,
        );
        return { allowed: true };
      }
    },
  };
}

export type Throttler = ReturnType<typeof createThrottler>;

type CheckSpec = {
  field: keyof TriggerThrottle;
  scope: string;
  windowKey: string;
  limit: number;
  ttlSeconds: number;
};

function buildChecks(
  throttle: TriggerThrottle,
  now: Date,
  endUserId: string | undefined,
): CheckSpec[] {
  const checks: CheckSpec[] = [];
  const minuteKey = `${Math.floor(now.getTime() / 60_000)}`;
  const hourKey = `${Math.floor(now.getTime() / 3_600_000)}`;
  const dayKey = `${Math.floor(now.getTime() / 86_400_000)}`;

  if (endUserId) {
    if (throttle.perUserPerMinute) {
      checks.push({
        field: "perUserPerMinute",
        scope: `user:${endUserId}`,
        windowKey: `m:${minuteKey}`,
        limit: throttle.perUserPerMinute,
        ttlSeconds: 70,
      });
    }
    if (throttle.perUserPerHour) {
      checks.push({
        field: "perUserPerHour",
        scope: `user:${endUserId}`,
        windowKey: `h:${hourKey}`,
        limit: throttle.perUserPerHour,
        ttlSeconds: 3700,
      });
    }
    if (throttle.perUserPerDay) {
      checks.push({
        field: "perUserPerDay",
        scope: `user:${endUserId}`,
        windowKey: `d:${dayKey}`,
        limit: throttle.perUserPerDay,
        ttlSeconds: 86_500,
      });
    }
  }

  if (throttle.perOrgPerMinute) {
    checks.push({
      field: "perOrgPerMinute",
      scope: "org",
      windowKey: `m:${minuteKey}`,
      limit: throttle.perOrgPerMinute,
      ttlSeconds: 70,
    });
  }
  if (throttle.perOrgPerHour) {
    checks.push({
      field: "perOrgPerHour",
      scope: "org",
      windowKey: `h:${hourKey}`,
      limit: throttle.perOrgPerHour,
      ttlSeconds: 3700,
    });
  }

  return checks;
}
