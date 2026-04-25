/**
 * CmsSchemaDef → Zod converter.
 *
 * Two responsibilities:
 *
 * 1. `validateSchemaDef(schema)` — sanity-checks a schema definition itself
 *    before persisting (unique field names, required nested defs for array /
 *    object, valid enum for select / multiselect, …). Throws CmsInvalidSchema.
 *
 * 2. `buildZodFromSchemaDef(schema)` — returns a `z.ZodObject` that validates
 *    an entry's `data` payload against the schema.
 *
 * The converter is intentionally narrow — it covers the field types this
 * module owns and nothing else. Adding a new type is a 3-line change in the
 * `buildField` switch.
 */

import { z } from "@hono/zod-openapi";
import type { ZodTypeAny } from "zod";

import { CmsInvalidSchema } from "./errors";
import { CMS_FIELD_TYPES, type CmsFieldDef, type CmsSchemaDef } from "./types";

// ─── Schema-def sanity check ────────────────────────────────────────

/**
 * Field name pattern. Mirrors a typical JS identifier so consumers can
 * destructure with `const { ... } = data` without quoting.
 */
const FIELD_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function validateSchemaDef(schema: unknown): asserts schema is CmsSchemaDef {
  if (!schema || typeof schema !== "object") {
    throw new CmsInvalidSchema("schema must be an object with a 'fields' array");
  }
  const s = schema as { fields?: unknown };
  if (!Array.isArray(s.fields)) {
    throw new CmsInvalidSchema("schema.fields must be an array");
  }
  validateFieldList(s.fields, ["fields"]);
}

function validateFieldList(fields: unknown[], path: string[]) {
  const seen = new Set<string>();
  fields.forEach((raw, idx) => {
    const fieldPath = [...path, String(idx)];
    if (!raw || typeof raw !== "object") {
      throw new CmsInvalidSchema(`${fieldPath.join(".")} must be an object`);
    }
    const f = raw as CmsFieldDef;
    if (typeof f.name !== "string" || !FIELD_NAME_RE.test(f.name)) {
      throw new CmsInvalidSchema(
        `${fieldPath.join(".")}.name must match ${FIELD_NAME_RE.source}`,
      );
    }
    if (seen.has(f.name)) {
      throw new CmsInvalidSchema(
        `duplicate field name '${f.name}' at ${fieldPath.join(".")}`,
      );
    }
    seen.add(f.name);

    if (typeof f.label !== "string" || f.label.length === 0) {
      throw new CmsInvalidSchema(
        `${fieldPath.join(".")}.label must be a non-empty string`,
      );
    }
    if (!CMS_FIELD_TYPES.includes(f.type)) {
      throw new CmsInvalidSchema(
        `${fieldPath.join(".")}.type must be one of ${CMS_FIELD_TYPES.join(", ")}`,
      );
    }

    if (f.type === "select" || f.type === "multiselect") {
      const opts = f.validation?.enum;
      if (!Array.isArray(opts) || opts.length === 0) {
        throw new CmsInvalidSchema(
          `${fieldPath.join(".")}.validation.enum is required for ${f.type}`,
        );
      }
      const values = new Set<string>();
      opts.forEach((opt, i) => {
        if (
          !opt ||
          typeof opt !== "object" ||
          typeof opt.value !== "string" ||
          typeof opt.label !== "string"
        ) {
          throw new CmsInvalidSchema(
            `${fieldPath.join(".")}.validation.enum[${i}] must be {value, label}`,
          );
        }
        if (values.has(opt.value)) {
          throw new CmsInvalidSchema(
            `${fieldPath.join(".")}.validation.enum has duplicate value '${opt.value}'`,
          );
        }
        values.add(opt.value);
      });
    }

    if (f.type === "array") {
      if (!f.itemDef) {
        throw new CmsInvalidSchema(
          `${fieldPath.join(".")}.itemDef is required for arrays`,
        );
      }
      validateFieldList([f.itemDef], [...fieldPath, "itemDef"]);
    }

    if (f.type === "object") {
      if (!Array.isArray(f.fields)) {
        throw new CmsInvalidSchema(
          `${fieldPath.join(".")}.fields[] is required for objects`,
        );
      }
      validateFieldList(f.fields, [...fieldPath, "fields"]);
    }
  });
}

// ─── Schema-def evolution check ─────────────────────────────────────

/**
 * Enforce additive-only schema evolution.
 *
 * Allowed:
 *   - Add a new field (must be optional or have a default)
 *   - Loosen validation (raise max, lower min, add enum option)
 *   - Edit label / description / options (UI-only)
 *
 * Forbidden:
 *   - Remove a field (existing entries reference it)
 *   - Rename a field
 *   - Change a field's `type`
 *   - Flip required from false → true on an existing field
 *   - Remove an enum value (existing entries may hold it)
 *
 * Rationale: entries store data validated against the schema *as it was*.
 * A breaking change leaves a swath of entries mid-state-invalid with no
 * reasonable migration path inside a single deploy. If a tenant truly
 * needs a breaking change, they copy the type and migrate manually.
 */
export function assertNonBreakingChange(
  prev: CmsSchemaDef,
  next: CmsSchemaDef,
): void {
  const prevByName = new Map(prev.fields.map((f) => [f.name, f]));
  const nextByName = new Map(next.fields.map((f) => [f.name, f]));

  for (const [name, prevField] of prevByName) {
    const nextField = nextByName.get(name);
    if (!nextField) {
      throw new CmsInvalidSchema(
        `breaking change: field '${name}' was removed; copy to a new type instead`,
      );
    }
    if (nextField.type !== prevField.type) {
      throw new CmsInvalidSchema(
        `breaking change: field '${name}' changed type from '${prevField.type}' to '${nextField.type}'`,
      );
    }
    if (!prevField.required && nextField.required) {
      throw new CmsInvalidSchema(
        `breaking change: field '${name}' became required (was optional)`,
      );
    }
    if (prevField.type === "select" || prevField.type === "multiselect") {
      const prevValues = new Set(
        (prevField.validation?.enum ?? []).map((o) => o.value),
      );
      const nextValues = new Set(
        (nextField.validation?.enum ?? []).map((o) => o.value),
      );
      for (const v of prevValues) {
        if (!nextValues.has(v)) {
          throw new CmsInvalidSchema(
            `breaking change: enum value '${v}' was removed from field '${name}'`,
          );
        }
      }
    }
  }
}

// ─── Build runtime Zod from CmsSchemaDef ────────────────────────────

export function buildZodFromSchemaDef(
  schema: CmsSchemaDef,
): ReturnType<typeof buildObjectShape> {
  return buildObjectShape(schema.fields);
}

function buildObjectShape(fields: CmsFieldDef[]) {
  const shape: Record<string, ZodTypeAny> = {};
  for (const f of fields) {
    let s = buildField(f);
    if (!f.required) {
      // Allow `null` and absence — null is what the admin form sends when
      // the user clears a non-required field.
      s = s.nullish();
    }
    shape[f.name] = s;
  }
  // strip = drop unknown keys instead of throwing — stale data after
  // a non-breaking schema change still validates.
  return z.object(shape).strip();
}

function buildField(f: CmsFieldDef): ZodTypeAny {
  switch (f.type) {
    case "text":
    case "textarea":
    case "markdown":
      return buildString(f);
    case "number":
      return buildNumber(f);
    case "boolean":
      return z.boolean();
    case "date":
      return z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
    case "datetime":
      // Accept ISO 8601 — covers what `new Date().toISOString()` emits.
      return z.string().datetime({ offset: true });
    case "select":
      return buildEnum(f);
    case "multiselect":
      return z.array(buildEnum(f));
    case "image":
      return z
        .object({
          mediaId: z.string().min(1),
          alt: z.string().optional(),
        })
        .strip();
    case "entryRef":
      return z
        .object({
          typeAlias: z.string().min(1),
          alias: z.string().min(1),
        })
        .strip();
    case "array": {
      if (!f.itemDef) {
        throw new CmsInvalidSchema(`array field '${f.name}' missing itemDef`);
      }
      const itemSchema = buildField(f.itemDef);
      let arr: ZodTypeAny = z.array(itemSchema);
      const v = f.validation;
      if (v?.min !== undefined) arr = (arr as z.ZodArray<ZodTypeAny>).min(v.min);
      if (v?.max !== undefined) arr = (arr as z.ZodArray<ZodTypeAny>).max(v.max);
      return arr;
    }
    case "object": {
      if (!f.fields) {
        throw new CmsInvalidSchema(`object field '${f.name}' missing fields`);
      }
      return buildObjectShape(f.fields);
    }
    case "json":
      return z.unknown();
    default: {
      const _exhaustive: never = f.type;
      void _exhaustive;
      throw new CmsInvalidSchema(`unsupported field type: ${String(f.type)}`);
    }
  }
}

function buildString(f: CmsFieldDef): ZodTypeAny {
  let s = z.string();
  const v = f.validation;
  if (v?.minLength !== undefined) s = s.min(v.minLength);
  if (v?.maxLength !== undefined) s = s.max(v.maxLength);
  if (v?.pattern) {
    try {
      s = s.regex(new RegExp(v.pattern));
    } catch {
      throw new CmsInvalidSchema(
        `field '${f.name}' has invalid regex pattern: ${v.pattern}`,
      );
    }
  }
  return s;
}

function buildNumber(f: CmsFieldDef): ZodTypeAny {
  let n = z.number();
  const v = f.validation;
  if (v?.min !== undefined) n = n.min(v.min);
  if (v?.max !== undefined) n = n.max(v.max);
  return n;
}

function buildEnum(f: CmsFieldDef): ZodTypeAny {
  const opts = f.validation?.enum ?? [];
  if (opts.length === 0) {
    // validateSchemaDef should have rejected this, but the runtime
    // converter should never produce z.enum([]) which is invalid.
    throw new CmsInvalidSchema(`field '${f.name}' is select/multiselect with empty enum`);
  }
  const values = opts.map((o) => o.value) as [string, ...string[]];
  return z.enum(values);
}
