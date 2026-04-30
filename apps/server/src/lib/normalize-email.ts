/**
 * 轻量 email 规范化 —— 替代 `better-auth-harmony` 的运行时部分。
 *
 * Why this file instead of the upstream plugin:
 *   `better-auth-harmony` 在顶层 import 时把 `validator.js` + `mailchecker`
 *   (~55k disposable email 域名 JSON) 拉进 bundle,推爆了 CF Workers 的
 *   startup CPU 限额(code 10021,见 `project_server_startup_cpu`)。我们
 *   只需要 normalization,不需要 disposable-email 校验,所以自己写。
 *
 * What it does (subset of emailHarmony):
 *   1. 全字符串 lowercase + trim
 *   2. 所有域名:strip "+alias" 后缀(Gmail/Outlook/iCloud 等主流邮箱都
 *      支持 plus 别名,这是抗薅羊毛的最大单点收益)
 *   3. Gmail / googlemail.com:本地部分去掉所有点(`j.o.h.n` ≡ `john`),
 *      并把 googlemail.com 域统一改写为 gmail.com
 *
 * What it does NOT do:
 *   - Disposable / throwaway 域名拦截(emailHarmony 的 mailchecker 部分)
 *   - 邮箱格式校验(由 zod / Better Auth 上游负责)
 *   - 其他邮箱提供商的特殊规则(Outlook 的 dot 不忽略,Yahoo 的 - 别名等)
 *
 * Used by:
 *   - `apps/server/src/auth.ts` 的 `databaseHooks.user.create.before` 和
 *     `databaseHooks.user.update.before` 写入 `user.normalized_email` 列。
 *     UNIQUE 约束阻同人多账号(已迁移,见 drizzle/0007)。
 */
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function normalizeEmail(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at <= 0 || at === lower.length - 1) {
    // Malformed — return as-is, let upstream validation reject.
    return lower;
  }

  let local = lower.slice(0, at);
  const domain = lower.slice(at + 1);

  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);

  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, "");
    return `${local}@gmail.com`;
  }

  return `${local}@${domain}`;
}
