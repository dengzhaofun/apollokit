/**
 * 从 filtrex 表达式中提取引用的字段名（dot-path 前缀）。
 *
 * 粗略实现：匹配 `[A-Za-z_][A-Za-z0-9_.]*` 的 token，排除 filtrex 保留字
 * 和函数名。用于软校验 —— 漏报比误报更安全，校验结果只作 warning。
 *
 * 当前阶段仅作为 util 导出，UI 可以调 `/api/event-catalog/:name` 拿字段
 * 列表后在前端本地比对；future work：改造 task create/update 返回
 * `{ definition, warnings }` 把 warning 带到 API。
 */

const FILTREX_KEYWORDS = new Set([
  "and",
  "or",
  "not",
  "in",
  "of",
  "true",
  "false",
  "if",
  "then",
  "else",
  "abs",
  "ceil",
  "floor",
  "log",
  "max",
  "min",
  "round",
  "sqrt",
  "exists",
  "empty",
]);

export function extractReferencedFields(expression: string): string[] {
  // Strip single- and double-quoted string literals first so identifiers
  // inside them (e.g. `"dragon"`) don't get picked up as field references.
  // filtrex supports both quote styles. Escapes are not commonly used;
  // the regex handles the simple non-escaped case which covers every
  // filter we generate or accept.
  const stripped = expression.replace(/"[^"]*"|'[^']*'/g, "");
  const re = /[A-Za-z_][A-Za-z0-9_.]*/g;
  const out = new Set<string>();
  for (const m of stripped.matchAll(re)) {
    const token = m[0];
    if (FILTREX_KEYWORDS.has(token.toLowerCase())) continue;
    out.add(token);
  }
  return Array.from(out).sort();
}

/**
 * 给定事件 catalog 的已知 path 集合，返回表达式里引用但 catalog 没有的
 * 字段名列表。集合空时返回空数组 —— 不知道的事件不能生成 warning。
 */
export function findUnknownFilterFields(
  expression: string,
  knownPaths: string[],
): string[] {
  if (knownPaths.length === 0) return [];
  const known = new Set(knownPaths);
  // 允许前缀匹配：引用 `stats.level` 时，如果 `stats` 在 known 且 `stats.level`
  // 也在 known —— 算已知；如果只有 `stats` 在 known，说明 catalog 没展开到
  // `stats.level` 这个子字段，此时该字段视为"未知"。严格一些。
  return extractReferencedFields(expression).filter(
    (path) => !known.has(path),
  );
}
