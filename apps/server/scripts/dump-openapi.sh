#!/usr/bin/env bash
#
# Snapshot the live OpenAPI document to apps/server/openapi.json.
#
# Why a snapshot at all: apps/admin's fumadocs API reference is generated
# at build time from this file. Committing the snapshot means the admin
# build doesn't need wrangler dev running, and PR diffs surface every
# externally-visible API change next to the code that caused it.
#
# Prereq: wrangler dev must be running on localhost:8787 (run `pnpm dev`
# at the repo root or `pnpm --filter=server dev`). The script just curls.
# We don't run app in-process here because it imports `cloudflare:workers`
# and would need the same shim/wiring vitest already has — not worth the
# code duplication for a script the developer manually invokes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$SCRIPT_DIR/../openapi.json"
URL="${OPENAPI_DUMP_URL:-http://localhost:8787/openapi.json}"

if ! curl --fail --silent --show-error --max-time 10 "$URL" -o "$OUT.tmp"; then
  echo "FAILED to fetch $URL" >&2
  echo "Is wrangler dev running? Try: pnpm --filter=server dev" >&2
  rm -f "$OUT.tmp"
  exit 1
fi

# Post-process:
#   1. Inject a top-level `tags` array derived from every operation's
#      `tags` field. Required by `fumadocs-openapi` (its `fromTagName`
#      lookup returns undefined and crashes if the tag isn't declared
#      at the document level). Scalar UI also displays these tags as
#      group descriptions when present.
#   2. Pretty-print so the committed snapshot diffs cleanly when only
#      one operation changes.
node --input-type=module -e "
  import { readFileSync, writeFileSync } from 'node:fs';
  const doc = JSON.parse(readFileSync('$OUT.tmp', 'utf8'));
  const seen = new Set();
  for (const ops of Object.values(doc.paths ?? {})) {
    for (const op of Object.values(ops)) {
      if (op && typeof op === 'object' && Array.isArray(op.tags)) {
        for (const t of op.tags) seen.add(t);
      }
    }
  }
  doc.tags = [...seen].sort().map((name) => ({ name }));
  writeFileSync('$OUT', JSON.stringify(doc, null, 2) + '\n');
"
rm -f "$OUT.tmp"

bytes=$(wc -c < "$OUT" | tr -d ' ')
echo "Wrote $OUT ($bytes bytes)"
