import { env } from "cloudflare:workers";
import { Redis } from "@upstash/redis/cloudflare";

// Lazy via Proxy —— `new Redis({...})` 在模块加载时读 env、初始化 fetch
// transport、注册命令表,直接计入 startup CPU。把构造延迟到首次方法访问,
// 跟 auth / storage / analytics 一致。调用形式 (`redis.set/get/...`) 透传不变。
let instance: Redis | null = null;
function resolve(): Redis {
  if (!instance) {
    instance = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return instance;
}

export const redis: Redis = new Proxy({} as Redis, {
  get(_t, prop) {
    const target = resolve() as unknown as Record<string | symbol, unknown>;
    const value = target[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value;
  },
});
