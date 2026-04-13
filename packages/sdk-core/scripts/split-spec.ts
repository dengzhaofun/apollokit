/**
 * Split the full OpenAPI spec into admin and client specs.
 *
 * Admin spec: all paths NOT starting with /api/client/
 * Client spec: only paths starting with /api/client/
 *
 * Each output spec includes only the schemas transitively referenced
 * by its paths. Security schemes are adjusted per audience.
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
// Split logic
// ---------------------------------------------------------------------------

function splitSpec(
  full: OpenAPISpec,
  pathFilter: (path: string) => boolean,
  title: string,
  securitySchemes: Record<string, unknown>,
): OpenAPISpec {
  // Filter paths
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [path, ops] of Object.entries(full.paths)) {
    if (pathFilter(path)) {
      paths[path] = ops;
    }
  }

  // Collect directly referenced schemas
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

  // Build output components
  const components: OpenAPISpec["components"] = {};
  if (Object.keys(schemas).length > 0) components.schemas = schemas;
  if (Object.keys(securitySchemes).length > 0)
    components.securitySchemes = securitySchemes;

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

  // Admin spec: everything except /api/client/* paths
  const adminSpec = splitSpec(
    full,
    (path) => !path.startsWith("/api/client/"),
    "apollokit Admin API",
    {
      AdminApiKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description:
          "Admin API key with ak_ prefix. Create via the dashboard or POST /api/client-credentials.",
      },
    },
  );

  // Client spec: only /api/client/* paths
  const clientSpec = splitSpec(
    full,
    (path) => path.startsWith("/api/client/"),
    "apollokit Client API",
    {
      ClientKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description:
          "Client publishable key with cpk_ prefix. Obtain from your admin dashboard.",
      },
    },
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
