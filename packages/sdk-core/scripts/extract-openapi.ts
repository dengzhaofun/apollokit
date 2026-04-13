/**
 * Extract the OpenAPI spec from the server app without starting a dev server.
 *
 * Uses Hono's `app.request()` to call the /openapi.json endpoint in-process.
 * Writes the full spec to specs/openapi.json.
 *
 * Usage: tsx scripts/extract-openapi.ts [--url http://localhost:8787]
 *
 * With --url it fetches from a running server instead of importing the app.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specsDir = resolve(__dirname, "../specs");

mkdirSync(specsDir, { recursive: true });

const urlArg = process.argv.indexOf("--url");
const serverUrl = urlArg !== -1 ? process.argv[urlArg + 1] : null;

async function extract(): Promise<void> {
  let spec: unknown;

  if (serverUrl) {
    // Fetch from running dev server
    const res = await fetch(`${serverUrl}/openapi.json`);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch OpenAPI spec from ${serverUrl}: ${res.status}`,
      );
    }
    spec = await res.json();
  } else {
    // Import the Hono app and call in-process
    // This requires the server's dependencies to be resolvable
    const { default: app } = await import(
      "../../../apps/server/src/index.ts"
    );
    const res = await app.request("/openapi.json");
    if (!res.ok) {
      throw new Error(`Failed to extract OpenAPI spec: ${res.status}`);
    }
    spec = await res.json();
  }

  const outPath = resolve(specsDir, "openapi.json");
  writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n");
  console.log(`Wrote full OpenAPI spec to ${outPath}`);
}

extract().catch((err) => {
  console.error("Extract failed:", err);
  process.exit(1);
});
