/**
 * Augments `Cloudflare.Env` with worker secrets that `wrangler types`
 * can't infer from `wrangler.jsonc`. Keep in sync with the secret list
 * documented in `wrangler.jsonc` and with `testing/cloudflare-workers-shim.ts`.
 */
declare namespace Cloudflare {
  interface Env {
    DATABASE_URL: string;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    UPSTASH_REDIS_REST_URL: string;
    UPSTASH_REDIS_REST_TOKEN: string;
    TINYBIRD_TOKEN: string;
    TINYBIRD_URL: string;
    TINYBIRD_WORKSPACE_ID: string;
    OPENROUTER_API_KEY: string;
    /** Sentry DSN（dzfun/apollokit-server）— 未配时 SDK 自动 no-op */
    SENTRY_DSN?: string;
    /** Sentry 环境标签；wrangler.jsonc vars 固定为 production，本地无值时 worker.ts 兜底 development */
    SENTRY_ENVIRONMENT?: string;
    /** Cloudflare 版本元数据；@sentry/cloudflare ≥ 10.35 自动从 .id 取 release */
    CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
  }
}
