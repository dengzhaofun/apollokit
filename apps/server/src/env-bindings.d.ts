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
  }
}
