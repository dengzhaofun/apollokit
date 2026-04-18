#!/usr/bin/env bash
# Push every KEY=VALUE line from apps/server/.dev.vars to Cloudflare as
# a wrangler secret (skipping blank and comment lines).
#
# Use from the repo root:
#   pnpm --filter=server secrets:push
#
# Optional: pass `--env <name>` (or any extra flags) — they're forwarded
# to `wrangler secret put`, e.g. `secrets:push -- --env production`.
#
# `.dev.vars` is gitignored and contains plaintext secrets — this script
# is the only authorized promoter from local dev to production.

set -euo pipefail

# cd to apps/server/ regardless of where the script is called from
cd "$(dirname "$0")/.."

if [[ ! -f .dev.vars ]]; then
  echo "ERROR: apps/server/.dev.vars not found" >&2
  exit 1
fi

extra_args=("$@")

count=0
skipped=0
while IFS= read -r line || [[ -n "$line" ]]; do
  # Trim CR (Windows editors) and leading/trailing whitespace
  line="${line%$'\r'}"
  # Skip blank lines and comments
  if [[ -z "${line// }" ]] || [[ "$line" =~ ^[[:space:]]*# ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  # Split on first '=' only (values may contain '=')
  if [[ "$line" != *"="* ]]; then
    skipped=$((skipped + 1))
    continue
  fi
  key="${line%%=*}"
  value="${line#*=}"

  # Strip whitespace from key
  key="$(echo -n "$key" | awk '{$1=$1};1')"

  # Unquote double-quoted values (wrangler is sensitive to the quotes)
  if [[ "$value" == \"*\" && "${#value}" -ge 2 ]]; then
    value="${value:1:${#value}-2}"
  fi

  echo "→ wrangler secret put $key"
  # stdin-fed value keeps it off the process table.
  # `${extra_args[@]+"${extra_args[@]}"}` expands the array only when set —
  # plain `"${extra_args[@]}"` tripping `set -u` with an empty array is
  # the exact bug this pattern avoids.
  printf '%s' "$value" | npx --yes wrangler secret put "$key" ${extra_args[@]+"${extra_args[@]}"} >/dev/null
  count=$((count + 1))
done < .dev.vars

echo
echo "✓ pushed $count secrets (skipped $skipped blank/comment lines)"
