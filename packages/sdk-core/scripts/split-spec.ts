/**
 * Split the full OpenAPI spec into admin and client specs.
 *
 * Admin spec: all paths NOT starting with /api/v1/client/
 * Client spec: only paths starting with /api/v1/client/
 *
 * Each output spec includes only the schemas transitively referenced by
 * its paths. `components.securitySchemes` is copied from the source and
 * trimmed to schemes that are actually relevant to that audience —
 * `Session` is dropped from both (cookie-only, never used by SDKs);
 * `AdminApiKey` and `ClientCredential` stay only with their respective
 * audience. Each operation's `security` array is filtered the same way
 * so SDK generators don't see dangling references.
 *
 * Usage: tsx scripts/split-spec.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specsDir = resolve(__dirname, "../specs");

// ---------------------------------------------------------------------------
// Types (minimal OpenAPI 3.1 subset)
// ---------------------------------------------------------------------------

interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

type SecurityRequirement = Record<string, string[]>;

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
]);

// ---------------------------------------------------------------------------
// Schema reference collector
// ---------------------------------------------------------------------------

function collectRefs(obj: unknown, refs: Set<string>): void {
  if (obj === null || obj === undefined) return;
  if (Array.isArray(obj)) {
    for (const item of obj) collectRefs(item, refs);
    return;
  }
  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    if (typeof record["$ref"] === "string") {
      const ref = record["$ref"];
      // Only collect component schema refs
      const match = ref.match(/^#\/components\/schemas\/(.+)$/);
      if (match) refs.add(match[1]!);
    }
    for (const value of Object.values(record)) {
      collectRefs(value, refs);
    }
  }
}

/**
 * Given a set of initially referenced schema names, expand it to include
 * all transitively referenced schemas.
 */
function expandRefs(
  schemas: Record<string, unknown>,
  initial: Set<string>,
): Set<string> {
  const all = new Set(initial);
  const queue = [...initial];
  while (queue.length > 0) {
    const name = queue.pop()!;
    const schema = schemas[name];
    if (!schema) continue;
    const nested = new Set<string>();
    collectRefs(schema, nested);
    for (const ref of nested) {
      if (!all.has(ref)) {
        all.add(ref);
        queue.push(ref);
      }
    }
  }
  return all;
}

// ---------------------------------------------------------------------------
// Path security filter
// ---------------------------------------------------------------------------

/**
 * Walk the filtered paths and strip dropped security scheme refs from
 * every operation's `security` array. Returns a new paths object;
 * input is not mutated.
 */
function stripDroppedSecurity(
  paths: Record<string, Record<string, unknown>>,
  keptSchemes: Set<string>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [path, methods] of Object.entries(paths)) {
    const newMethods: Record<string, unknown> = { ...methods };
    for (const [method, op] of Object.entries(methods)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      if (op === null || typeof op !== "object") continue;
      const opRecord = op as Record<string, unknown>;
      const security = opRecord["security"];
      if (!Array.isArray(security)) continue;
      const filtered = (security as SecurityRequirement[]).filter((req) =>
        Object.keys(req).every((name) => keptSchemes.has(name)),
      );
      newMethods[method] = { ...opRecord, security: filtered };
    }
    out[path] = newMethods;
  }
  return out;
}

// ---------------------------------------------------------------------------
// OpenAPI 3.1 null-type normalization for SDK generators
// ---------------------------------------------------------------------------

/**
 * Walk the spec in place and replace every `{ "type": "null" }` schema
 * with `{}` (any-value). OpenAPI 3.1 lets you write `type: null` as a
 * standalone schema (it means "the JSON value `null`"), which is valid
 * JSON Schema 2020-12 but not understood by the Fern generator
 * (`Failed to convert schema breadcrumbs=…  value={"type":"null"}`).
 *
 * Two places in the spec produce it today:
 *   - error envelopes' `data` field (`ApiErrorEnvelope`, `ApiNullEnvelope`)
 *     where Zod's `z.null()` lowers to `type: null` — losing this
 *     information turns the SDK type into `unknown` for the error body,
 *     which is fine because the surrounding envelope already says
 *     `data: null` semantically via the `code !== "ok"` discriminator.
 *   - `oneOf: […, { type: "null" }]` branches in dialogue trigger
 *     conditions where the wider union admits `null`. Replacing the
 *     branch with `{}` widens the union to "any value" for that arm —
 *     the SDK loses the `null` guard but every other valid value is
 *     still accepted.
 *
 * Both losses are recoverable later: when Fern (or downstream
 * generators) ship full 3.1 support, drop this function. Until then,
 * SDK accuracy is the right thing to trade off for buildable output.
 */
function normalizeNullTypeForGenerators(node: unknown): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const item of node) normalizeNullTypeForGenerators(item);
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (record["type"] === "null" && Object.keys(record).length === 1) {
    delete record["type"];
    return;
  }
  for (const value of Object.values(record)) {
    normalizeNullTypeForGenerators(value);
  }
}

// ---------------------------------------------------------------------------
// Split logic
// ---------------------------------------------------------------------------

function splitSpec(
  full: OpenAPISpec,
  pathFilter: (path: string) => boolean,
  title: string,
  keptSchemes: Set<string>,
): OpenAPISpec {
  // Filter paths
  const filteredPaths: Record<string, Record<string, unknown>> = {};
  for (const [path, ops] of Object.entries(full.paths)) {
    if (pathFilter(path)) {
      filteredPaths[path] = ops;
    }
  }

  // Strip operation-level security refs to dropped schemes
  const paths = stripDroppedSecurity(filteredPaths, keptSchemes);

  // Collect directly referenced schemas (after security stripping — body
  // / response refs aren't affected, but this keeps the input single-pass)
  const directRefs = new Set<string>();
  collectRefs(paths, directRefs);

  // Expand transitively
  const allSchemas = full.components?.schemas ?? {};
  const neededSchemas = expandRefs(
    allSchemas as Record<string, unknown>,
    directRefs,
  );

  // Build filtered schemas
  const schemas: Record<string, unknown> = {};
  for (const name of neededSchemas) {
    if (allSchemas[name]) {
      schemas[name] = allSchemas[name];
    }
  }

  // Trim source securitySchemes to the kept set
  const sourceSchemes = full.components?.securitySchemes ?? {};
  const securitySchemes: Record<string, unknown> = {};
  for (const name of keptSchemes) {
    if (sourceSchemes[name]) {
      securitySchemes[name] = sourceSchemes[name];
    }
  }

  // Build output components
  const components: OpenAPISpec["components"] = {};
  if (Object.keys(schemas).length > 0) components.schemas = schemas;
  if (Object.keys(securitySchemes).length > 0)
    components.securitySchemes = securitySchemes;

  // Strip OpenAPI-3.1-only `{"type": "null"}` schemas — Fern's parser
  // rejects them. Mutates paths + components in place; runs last so
  // every $ref-expanded subtree is covered.
  normalizeNullTypeForGenerators(paths);
  normalizeNullTypeForGenerators(components);

  return {
    openapi: full.openapi,
    info: {
      ...full.info,
      title,
    },
    servers: full.servers,
    paths,
    ...(Object.keys(components).length > 0 ? { components } : {}),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const fullPath = resolve(specsDir, "openapi.json");
  const full: OpenAPISpec = JSON.parse(readFileSync(fullPath, "utf-8"));

  // Admin spec for SDK consumers — drop cookie-only `Session`, keep only
  // `AdminApiKey`. `ClientCredential` shouldn't appear on admin paths;
  // if it does it's filtered out the same way.
  const adminSpec = splitSpec(
    full,
    (path) => !path.startsWith("/api/v1/client/"),
    "apollokit Admin API",
    new Set(["AdminApiKey"]),
  );

  // Client spec — keep only `ClientCredential`.
  const clientSpec = splitSpec(
    full,
    (path) => path.startsWith("/api/v1/client/"),
    "apollokit Client API",
    new Set(["ClientCredential"]),
  );

  const adminPath = resolve(specsDir, "openapi-admin.json");
  const clientPath = resolve(specsDir, "openapi-client.json");

  writeFileSync(adminPath, JSON.stringify(adminSpec, null, 2) + "\n");
  writeFileSync(clientPath, JSON.stringify(clientSpec, null, 2) + "\n");

  const adminPathCount = Object.keys(adminSpec.paths).length;
  const clientPathCount = Object.keys(clientSpec.paths).length;
  const adminSchemaCount = Object.keys(
    adminSpec.components?.schemas ?? {},
  ).length;
  const clientSchemaCount = Object.keys(
    clientSpec.components?.schemas ?? {},
  ).length;

  console.log(
    `Admin spec: ${adminPathCount} paths, ${adminSchemaCount} schemas → ${adminPath}`,
  );
  console.log(
    `Client spec: ${clientPathCount} paths, ${clientSchemaCount} schemas → ${clientPath}`,
  );
}

main();
