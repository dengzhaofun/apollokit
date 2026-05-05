#!/usr/bin/env bash
# Symlink main repo node_modules into a worktree.
# Usage: bash scripts/link-worktree-deps.sh <worktree_path>
# Or called automatically via PostToolUse EnterWorktree hook (path parsed from stdin JSON).
set -e

if [[ -n "$1" ]]; then
  WORKTREE="$1"
else
  INPUT=$(cat)
  WORKTREE=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = (d.get('tool_response') or {}).get('worktreePath') \
 or d.get('worktreePath') \
 or ''
print(p)
" 2>/dev/null || true)
fi

[[ -z "$WORKTREE" ]] && { echo "link-worktree-deps: no worktree path"; exit 0; }
[[ ! -d "$WORKTREE" ]] && { echo "link-worktree-deps: not a directory: $WORKTREE"; exit 1; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

link_nm() {
  local rel="$1"
  local src="$REPO_ROOT/$rel"
  local dst="$WORKTREE/$rel"
  [[ ! -d "$src" ]] && return
  mkdir -p "$(dirname "$dst")"
  ln -sfn "$src" "$dst"
  echo "linked: $dst"
}

link_nm "node_modules"
link_nm "apps/admin/node_modules"
link_nm "apps/server/node_modules"

# Copy server .dev.vars if not already present in worktree
DEV_VARS="$REPO_ROOT/apps/server/.dev.vars"
WT_DEV_VARS="$WORKTREE/apps/server/.dev.vars"
if [[ -f "$DEV_VARS" && ! -f "$WT_DEV_VARS" ]]; then
  cp "$DEV_VARS" "$WT_DEV_VARS"
  echo "copied: $WT_DEV_VARS"
fi

echo "link-worktree-deps: done"
