import type { EventFieldRow } from "../../schema/event-catalog";

/**
 * 从一次事件 payload 推断扁平化的字段 schema。
 *
 * - 把嵌套 object 展平成 dot-path；数组当作原子类型（不深入元素）。
 * - 类型从 `typeof` / `Array.isArray` / `=== null` 得出。
 * - `required` 默认 `false` —— 单次 payload 无法判断必填性，留给 admin 在
 *   PATCH 时纠正。
 *
 * 嵌套深度超过 8 时停止深入，防止 pathological payload 爆 stack。
 */
const MAX_DEPTH = 8;

export function inferFields(
  payload: Record<string, unknown>,
): EventFieldRow[] {
  const rows: EventFieldRow[] = [];
  walk(payload, "", 0, rows);
  rows.sort((a, b) => a.path.localeCompare(b.path));
  return rows;
}

function walk(
  value: unknown,
  prefix: string,
  depth: number,
  out: EventFieldRow[],
): void {
  if (depth >= MAX_DEPTH) return;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return;
  }
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push({ path, type: classify(v), required: false });
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      walk(v, path, depth + 1, out);
    }
  }
}

function classify(v: unknown): EventFieldRow["type"] {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  if (t === "string") return "string";
  if (t === "number") return "number";
  if (t === "boolean") return "boolean";
  if (t === "object") return "object";
  return "unknown";
}

/**
 * 把新推断的 rows merge 进已有 rows。规则：
 * - 已存在的 path：保留 description / required / 已有 type（不被新推断覆盖）。
 * - 新出现的 path：追加，type 从推断来，description 空。
 *
 * 这样 admin 手工改过的字段不会在下一次事件来时被推断"修复"掉。
 */
export function mergeFields(
  existing: EventFieldRow[],
  inferred: EventFieldRow[],
): EventFieldRow[] {
  const byPath = new Map<string, EventFieldRow>();
  for (const row of existing) byPath.set(row.path, row);
  for (const row of inferred) {
    if (!byPath.has(row.path)) byPath.set(row.path, row);
  }
  return Array.from(byPath.values()).sort((a, b) =>
    a.path.localeCompare(b.path),
  );
}
