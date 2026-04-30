/**
 * Compact module-resource summaries returned to the model after a patch
 * `execute` succeeds. The full module response can be hundreds of fields
 * (timestamps, nested arrays, ids); we don't want to flood the next
 * inference step's context, so we extract the few fields the model is
 * likely to need to confirm the change to the user.
 *
 * Each module gets a tiny picker. Unknown shape → fall through to a
 * minimal `{ id, name? }` projection. The picker is best-effort — it
 * never throws on missing fields, since the post-update model turn is
 * cosmetic ("已关闭 7日签到") and not where we want to surface bugs.
 */

type AnyRecord = Record<string, unknown>;

function pick<K extends string>(
  obj: AnyRecord,
  keys: readonly K[],
): Partial<Record<K, unknown>> {
  const out: Partial<Record<K, unknown>> = {};
  for (const k of keys) {
    if (k in obj) out[k] = obj[k];
  }
  return out;
}

const PICKERS: Record<string, readonly string[]> = {
  "check-in": ["id", "alias", "name", "isActive", "resetMode", "target"],
  "activity": ["id", "alias", "name", "status", "startAt", "endAt"],
  "announcement": ["id", "alias", "name", "title", "isActive", "startAt", "endAt"],
  "character": ["id", "alias", "name", "isActive"],
  "dialogue": ["id", "alias", "name", "isActive"],
  "item": ["id", "alias", "name", "isActive"],
  "task": ["id", "alias", "name", "isActive", "targetValue"],
};

export function serializeForAgent(module: string, resource: unknown): unknown {
  if (resource == null || typeof resource !== "object") return resource;
  const obj = resource as AnyRecord;
  const keys = PICKERS[module];
  if (keys) return pick(obj, keys);
  // Unknown module — fall back to id + name if present.
  return pick(obj, ["id", "alias", "name"] as const);
}
